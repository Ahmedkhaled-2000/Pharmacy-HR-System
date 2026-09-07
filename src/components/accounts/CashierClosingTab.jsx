import React, { useState, useMemo } from 'react';
import { printIsolatedReport } from '../../utils/printAccountingReport';

/**
 * CashierClosingTab.jsx
 * تبويبة خزينة الكاشير والعجز والزيادة وتسويات الجرد الشهري
 */
export default function CashierClosingTab({
  closings = [],
  branches = [],
  employees = [],
  selectedBranchId = '',
  fiscalPeriod = '',
  onOpenNewShiftModal,
  onDeleteClosing,
  onSettleInventoryShortage,
}) {
  // Sub-view mode: 'ledger' | 'branch_summary' | 'inventory_reconciliation' | 'cashier_ledger'
  const [subView, setSubView] = useState('branch_summary');

  // Filters
  const [filterBranchId, setFilterBranchId] = useState(selectedBranchId || '');
  const [filterCashierId, setFilterCashierId] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | balanced | shortage | surplus
  const [filterMonth, setFilterMonth] = useState(fiscalPeriod || new Date().toISOString().slice(0, 7));

  // Selected closure for detail modal/view
  const [viewingClosure, setViewingClosure] = useState(null);

  // State for Monthly Inventory Reconciliation Form
  const [reconBranchId, setReconBranchId] = useState(branches[0]?.id || 'b-1');
  const [reconMonth, setReconMonth] = useState(fiscalPeriod || new Date().toISOString().slice(0, 7));
  const [inventoryStockShortage, setInventoryStockShortage] = useState(1200); // عجز بضاعة الجرد الفعلي
  const [reconNotes, setReconNotes] = useState('');

  // Filtered Closings for ledger
  const filteredClosings = useMemo(() => {
    return closings.filter((c) => {
      const matchBranch = !filterBranchId || c.branch_id === filterBranchId;
      const matchCashier = !filterCashierId || c.cashier_id === filterCashierId;
      const matchStatus = filterStatus === 'all' || c.status === filterStatus;
      const matchMonth = !filterMonth || (c.closing_date && c.closing_date.startsWith(filterMonth));
      return matchBranch && matchCashier && matchStatus && matchMonth;
    });
  }, [closings, filterBranchId, filterCashierId, filterStatus, filterMonth]);

  // Overall KPIs
  const kpis = useMemo(() => {
    const list = closings.filter((c) => !filterMonth || (c.closing_date && c.closing_date.startsWith(filterMonth)));
    const totalShifts = list.length;
    const totalGrossSales = list.reduce((s, c) => s + (Number(c.gross_sales) || 0), 0);
    const totalActualCash = list.reduce((s, c) => s + (Number(c.actual_cash) || 0), 0);
    const totalShortage = list.filter((c) => c.status === 'shortage').reduce((s, c) => s + Math.abs(Number(c.difference) || 0), 0);
    const totalSurplus = list.filter((c) => c.status === 'surplus').reduce((s, c) => s + (Number(c.difference) || 0), 0);
    const balancedCount = list.filter((c) => c.status === 'balanced').length;
    const matchRate = totalShifts > 0 ? ((balancedCount / totalShifts) * 100).toFixed(1) : '100';

    return {
      totalShifts,
      totalGrossSales,
      totalActualCash,
      totalShortage,
      totalSurplus,
      matchRate,
    };
  }, [closings, filterMonth]);

  // Branch-by-Branch aggregation for current month
  const branchSummaries = useMemo(() => {
    return branches.map((b) => {
      const bClosings = closings.filter(
        (c) => c.branch_id === b.id && (!filterMonth || (c.closing_date && c.closing_date.startsWith(filterMonth)))
      );
      const shiftCount = bClosings.length;
      const sales = bClosings.reduce((s, c) => s + (Number(c.gross_sales) || 0), 0);
      const actualCash = bClosings.reduce((s, c) => s + (Number(c.actual_cash) || 0), 0);
      const shortage = bClosings.filter((c) => c.status === 'shortage').reduce((s, c) => s + Math.abs(Number(c.difference) || 0), 0);
      const surplus = bClosings.filter((c) => c.status === 'surplus').reduce((s, c) => s + (Number(c.difference) || 0), 0);
      const netDiscrepancy = surplus - shortage;

      // Today's specific data
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayClosings = bClosings.filter((c) => c.closing_date === todayStr);
      const todayShortage = todayClosings.filter((c) => c.status === 'shortage').reduce((s, c) => s + Math.abs(Number(c.difference) || 0), 0);
      const todaySurplus = todayClosings.filter((c) => c.status === 'surplus').reduce((s, c) => s + (Number(c.difference) || 0), 0);

      return {
        branch: b,
        shiftCount,
        sales,
        actualCash,
        shortage,
        surplus,
        netDiscrepancy,
        todayShortage,
        todaySurplus,
      };
    });
  }, [branches, closings, filterMonth]);

  // Inventory Reconciliation Calculations
  const reconData = useMemo(() => {
    const bClosings = closings.filter(
      (c) => c.branch_id === reconBranchId && (!reconMonth || (c.closing_date && c.closing_date.startsWith(reconMonth)))
    );
    const accumulatedSurplus = bClosings
      .filter((c) => c.status === 'surplus')
      .reduce((s, c) => s + (Number(c.difference) || 0), 0);

    const stockShortage = Number(inventoryStockShortage || 0);
    // Net Actual Financial Shortage = Max(0, Stock Shortage - Accumulated Surplus in Escrow)
    const netFinancialShortage = Math.max(0, stockShortage - accumulatedSurplus);
    const surplusOffsetUsed = Math.min(stockShortage, accumulatedSurplus);
    const remainingSurplus = Math.max(0, accumulatedSurplus - stockShortage);

    const branchName = branches.find((b) => b.id === reconBranchId)?.name || 'الفرع';

    return {
      branchName,
      accumulatedSurplus,
      stockShortage,
      surplusOffsetUsed,
      netFinancialShortage,
      remainingSurplus,
    };
  }, [closings, reconBranchId, reconMonth, inventoryStockShortage, branches]);

  // Print Single Shift Receipt
  const handlePrintSingleReceipt = (closing) => {
    const bName = branches.find((b) => b.id === closing.branch_id)?.name || 'الصيدلية';
    const shiftLabel = closing.shift_type === 'morning' ? 'الوردية الصباحية' : closing.shift_type === 'evening' ? 'الوردية المسائية' : 'الوردية الليلية';
    const statusLabel = closing.status === 'balanced' ? '🟢 مطابقة تامة' : closing.status === 'shortage' ? `🔴 عجز (${Math.abs(closing.difference).toLocaleString()} ج.م)` : `🔵 زيادة (${closing.difference.toLocaleString()} ج.م)`;

    const allocRows = (closing.allocated_employees || []).map((a, idx) => [
      String(idx + 1),
      a.employee_name,
      `${Number(a.amount || 0).toLocaleString()} ج.م`,
      `خصم عجز وردية صيدلية محمل على الراتب (${closing.closing_date})`,
    ]);

    printIsolatedReport({
      title: 'إيصال استلام وتقفيل وردية كاشير الصيدلية',
      subtitle: `تقرير استلام النقدية والعجز والزيادة - ${bName}`,
      documentNumber: closing.closure_number,
      date: `${closing.closing_date} ${closing.closing_time || ''}`,
      metadata: [
        { label: 'فرع الصيدلية', value: bName },
        { label: 'الوردية', value: shiftLabel },
        { label: 'الكاشير المسؤول', value: closing.cashier_name },
        { label: 'حالة الوردية', value: statusLabel },
        { label: 'تاريخ الإغلاق', value: closing.closing_date },
      ],
      summaryCards: [
        { title: 'إجمالي المبيعات بالسيستم', value: `${Number(closing.gross_sales || 0).toLocaleString()} ج.م`, color: '#0f766e' },
        { title: 'النقدية المتوقعة بالدرج', value: `${Number(closing.expected_cash || 0).toLocaleString()} ج.م`, color: '#0284c7' },
        { title: 'النقدية المحصورة فعلياً', value: `${Number(closing.actual_cash || 0).toLocaleString()} ج.م`, color: '#16a34a' },
        {
          title: closing.status === 'shortage' ? 'عجز نقدي مطلوب تحصيله' : closing.status === 'surplus' ? 'زيادة نقدية محتجزة بالأمانات' : 'تطابق الخزينة',
          value: `${Math.abs(closing.difference || 0).toLocaleString()} ج.م`,
          color: closing.status === 'shortage' ? '#dc2626' : closing.status === 'surplus' ? '#2563eb' : '#059669',
        },
      ],
      headers: ['م', 'البيان / اسم الموظف', 'المبلغ', 'الملاحظات والتوجيه المحاسبي'],
      rows: [
        ['1', 'عهدة افتتاحية (الفكة)', `${Number(closing.opening_float || 0).toLocaleString()} ج.م`, 'عهدة الدرج المستردة'],
        ['2', 'مبيعات الكاش النقدية بالدرج', `${Number(closing.cash_sales || 0).toLocaleString()} ج.م`, 'مبيعات نقدية'],
        ['3', 'مبيعات الشبكة والفيزا', `${Number(closing.visa_sales || 0).toLocaleString()} ج.م`, 'نقاط بيع بنكية'],
        ['4', 'مبيعات المحافظ وإنستاباي', `${Number(closing.wallet_sales || 0).toLocaleString()} ج.م`, 'محافظ إلكترونية'],
        ['5', 'مبيعات آجل وتعاقدات', `${Number(closing.credit_sales || 0).toLocaleString()} ج.م`, 'عملاء تعاقدات'],
        ['6', 'مصروفات ونثريات من الدرج', `-${Number(closing.drawer_expenses || 0).toLocaleString()} ج.م`, 'مصروفات تشغيلية'],
        ['7', 'مرتجعات نقدية للعملاء', `-${Number(closing.cash_returns || 0).toLocaleString()} ج.م`, 'مردودات مبيعات'],
        ['8', 'صافي النقدية المتوقعة', `${Number(closing.expected_cash || 0).toLocaleString()} ج.م`, 'حساب السيستم الآلي'],
        ['9', 'النقدية المسلمة فعلياً', `${Number(closing.actual_cash || 0).toLocaleString()} ج.م`, 'الجرد الفعلي'],
        ['10', closing.status === 'shortage' ? 'عجز نقدي محمل' : closing.status === 'surplus' ? 'زيادة نقدية بالأمانات' : 'مطابقة تامة', `${Math.abs(closing.difference || 0).toLocaleString()} ج.م`, closing.status === 'surplus' ? 'حساب 21804 لمقاصة الجرد' : 'مسير الرواتب'],
        ...allocRows,
      ],
      footerNotes: `ملاحظات الوردية: ${closing.notes || 'لا توجد'}. تم الإغلاق والاعتماد وفقاً لمعايير الرقابة الداخلية وإدارة الصيدليات.`,
      companyName: 'مجموعة صيدليات الإدارة الطبية',
    });
  };

  // Print Monthly Branch Cashier Discrepancy Report
  const handlePrintBranchSummaryReport = () => {
    const rows = branchSummaries.map((b, idx) => [
      String(idx + 1),
      b.branch.name,
      String(b.shiftCount),
      `${b.sales.toLocaleString()} ج.م`,
      `${b.actualCash.toLocaleString()} ج.م`,
      `${b.todayShortage.toLocaleString()} ج.م`,
      `${b.todaySurplus.toLocaleString()} ج.م`,
      `${b.shortage.toLocaleString()} ج.م`,
      `${b.surplus.toLocaleString()} ج.م`,
      `${b.netDiscrepancy.toLocaleString()} ج.م`,
    ]);

    printIsolatedReport({
      title: 'تقرير متابعة خزائن الفروع والعجز والزيادة اليومية والشهرية',
      subtitle: `الفترة المحاسبية: ${filterMonth} · مجموعة صيدليات الإدارة الطبية`,
      documentNumber: `RPT-CSH-${filterMonth.replace('-', '')}`,
      metadata: [
        { label: 'الفترة المحاسبية', value: filterMonth },
        { label: 'عدد الفروع المشمولة', value: `${branches.length} فروع` },
        { label: 'إجمالي الورديات المقفلة', value: `${kpis.totalShifts} وردية` },
        { label: 'نسبة الدقة والمطابقة', value: `${kpis.matchRate}%` },
      ],
      summaryCards: [
        { title: 'إجمالي مبيعات الفروع', value: `${kpis.totalGrossSales.toLocaleString()} ج.م`, color: '#0f766e' },
        { title: 'إجمالي النقدية الموردة', value: `${kpis.totalActualCash.toLocaleString()} ج.م`, color: '#16a34a' },
        { title: 'إجمالي العجز المحصل من الرواتب', value: `${kpis.totalShortage.toLocaleString()} ج.م`, color: '#dc2626' },
        { title: 'أمانات زيادات محتجزة للجرد (21804)', value: `${kpis.totalSurplus.toLocaleString()} ج.م`, color: '#2563eb' },
      ],
      headers: [
        'م',
        'فرع الصيدلية',
        'الورديات',
        'إجمالي المبيعات',
        'الكاش المورد',
        'عجز اليوم',
        'زيادة اليوم',
        'عجز الشهر',
        'زيادة الشهر',
        'صافي الفروقات',
      ],
      rows,
      footerNotes: 'تقرير رقابي موحد للإدارة المالية يوضح عجز وزيادة كل صيدلية يومياً وشهرياً وحركات الأمانات.',
      companyName: 'مجموعة صيدليات الإدارة الطبية',
    });
  };

  // Print Monthly Inventory Reconciliation Report
  const handlePrintInventoryReconReport = () => {
    printIsolatedReport({
      title: 'محضر تسوية الجرد الشهري للأصناف ومقاصة أمانات زيادة النقدية',
      subtitle: `تحديد العجز المالي الفعلي للفرع - ${reconData.branchName} لشهر ${reconMonth}`,
      documentNumber: `REC-INV-${reconMonth.replace('-', '')}-${reconBranchId}`,
      metadata: [
        { label: 'فرع الصيدلية', value: reconData.branchName },
        { label: 'شهر الجرد', value: reconMonth },
        { label: 'رقم حساب الأمانات', value: '21804 (أمانات زيادات نقدية الفروع)' },
        { label: 'تاريخ المحضر', value: new Date().toLocaleDateString('ar-EG') },
      ],
      summaryCards: [
        { title: 'عجز الجرد الفعلي للأصناف', value: `${reconData.stockShortage.toLocaleString()} ج.م`, color: '#dc2626' },
        { title: 'أمانات الزيادة النقدية المحتجزة', value: `${reconData.accumulatedSurplus.toLocaleString()} ج.م`, color: '#2563eb' },
        { title: 'مبلغ المقاصة المالي المستهلك', value: `${reconData.surplusOffsetUsed.toLocaleString()} ج.م`, color: '#059669' },
        { title: 'صافي العجز المالي الحقيقي للفرع', value: `${reconData.netFinancialShortage.toLocaleString()} ج.م`, color: '#b91c1c' },
      ],
      headers: ['م', 'عنصر التسوية والمقاصة المحاسبية', 'القيمة المالية', 'التفسير المحاسبي والرقابي'],
      rows: [
        ['1', 'عجز البضاعة الفعلي الناتج عن الجرد الشهري للأصناف', `${reconData.stockShortage.toLocaleString()} ج.م`, 'فارق بين الرصيد الدفتري والفعلي للأدوية'],
        ['2', 'رصيد أمانات الزيادة النقدية المحتجز بالخزينة طوال الشهر', `${reconData.accumulatedSurplus.toLocaleString()} ج.م`, 'حـ/ 21804 ناتج عن مبيعات تمت دون فواتير POS'],
        ['3', 'مبلغ المقاصة المستهلك لتغطية عجز البضاعة', `-${reconData.surplusOffsetUsed.toLocaleString()} ج.م`, 'استهلاك أمانات الزيادة لخفض عجز البضاعة'],
        ['4', 'صافي العجز المالي الفعلي الواجب توزيعه على الكوادر', `${reconData.netFinancialShortage.toLocaleString()} ج.م`, 'العجز الصافي النهائي الذي سيتم خصمه من مسير الرواتب'],
        ['5', 'المتبقي في حساب الأمانات بعد المقاصة (إن وجد)', `${reconData.remainingSurplus.toLocaleString()} ج.م`, 'يظل معلقاً كأمانات أو يُرحل كأرباح عرضية'],
      ],
      footerNotes: `ملاحظات التسوية: ${reconNotes || 'تمت المقاصة الشهرية بنجاح واعتماد صافي العجز المالي'}.`,
      companyName: 'مجموعة صيدليات الإدارة الطبية',
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── Top Header Banner ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '16px 20px',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '30px', background: '#f0fdf4', padding: '8px 12px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
            🔒
          </span>
          <div>
            <h1 style={{ margin: 0, fontSize: '19px', fontWeight: '900', color: '#0f172a' }}>
              خزينة الكاشير والعجز والزيادة
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#64748b' }}>
              تقفيل ورديات خزائن الكاشير اليومية للفروع، متابعة العجز وتوزيعه على الرواتب، وتجميد الزيادات لمقاصة الجرد الشهري
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="acc-btn acc-btn-outline"
            onClick={handlePrintBranchSummaryReport}
            title="طباعة التقرير اليومي والشهري المعزول لفروقات الفروع"
          >
            🖨️ طباعة تقرير الفروع (A4)
          </button>

          <button
            type="button"
            className="acc-btn acc-btn-primary"
            style={{ background: '#16a34a', borderColor: '#15803d' }}
            onClick={onOpenNewShiftModal}
          >
            🔒 تقفيل خزينة وردية جديدة
          </button>
        </div>
      </div>

      {/* ── 5 Core High-Level KPI Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '12px',
      }}>
        {/* KPI 1: Gross Shift Sales */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderTop: '3.5px solid #0f766e',
          borderRadius: '12px',
          padding: '12px 14px',
        }}>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>إجمالي مبيعات الورديات</div>
          <div style={{ fontSize: '18px', fontWeight: '900', color: '#0f766e', fontFamily: 'monospace', marginTop: '4px' }}>
            {kpis.totalGrossSales.toLocaleString()} ج.م
          </div>
          <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>
            {kpis.totalShifts} وردية مقفلة
          </div>
        </div>

        {/* KPI 2: Actual Cash Received */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderTop: '3.5px solid #16a34a',
          borderRadius: '12px',
          padding: '12px 14px',
        }}>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>الكاش المورد للخزائن</div>
          <div style={{ fontSize: '18px', fontWeight: '900', color: '#16a34a', fontFamily: 'monospace', marginTop: '4px' }}>
            {kpis.totalActualCash.toLocaleString()} ج.م
          </div>
          <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>
            جرد فعلي بالدرج
          </div>
        </div>

        {/* KPI 3: Total Shortage Allocated */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderTop: '3.5px solid #dc2626',
          borderRadius: '12px',
          padding: '12px 14px',
        }}>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>العجز النقدي المحمل ع الرواتب</div>
          <div style={{ fontSize: '18px', fontWeight: '900', color: '#dc2626', fontFamily: 'monospace', marginTop: '4px' }}>
            - {kpis.totalShortage.toLocaleString()} ج.م
          </div>
          <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>
            مخصوم آلياً من مسير الرواتب
          </div>
        </div>

        {/* KPI 4: Escrow Surpluses for Inventory */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderTop: '3.5px solid #2563eb',
          borderRadius: '12px',
          padding: '12px 14px',
        }}>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>أمانات زيادات محتجزة (21804)</div>
          <div style={{ fontSize: '18px', fontWeight: '900', color: '#2563eb', fontFamily: 'monospace', marginTop: '4px' }}>
            + {kpis.totalSurplus.toLocaleString()} ج.م
          </div>
          <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>
            لمقاصة الجرد الشهري للأصناف
          </div>
        </div>

        {/* KPI 5: Match Rate */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderTop: '3.5px solid #8b5cf6',
          borderRadius: '12px',
          padding: '12px 14px',
        }}>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>نسبة دقة ومطابقة الخزائن</div>
          <div style={{ fontSize: '18px', fontWeight: '900', color: '#8b5cf6', fontFamily: 'monospace', marginTop: '4px' }}>
            {kpis.matchRate}%
          </div>
          <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '2px' }}>
            ورديات مطابقة دون فروقات
          </div>
        </div>
      </div>

      {/* ── Sub-navigation Segmented Bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '6px 10px',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`acc-btn ${subView === 'branch_summary' ? 'acc-btn-primary' : 'acc-btn-outline'}`}
            style={{ fontSize: '12px', padding: '6px 14px' }}
            onClick={() => setSubView('branch_summary')}
          >
            📊 متابعة فروع الصيدليات (يومي وشهري)
          </button>

          <button
            type="button"
            className={`acc-btn ${subView === 'ledger' ? 'acc-btn-primary' : 'acc-btn-outline'}`}
            style={{ fontSize: '12px', padding: '6px 14px' }}
            onClick={() => setSubView('ledger')}
          >
            📜 دفتر ورديات وتقفيل الكاشير ({filteredClosings.length})
          </button>

          <button
            type="button"
            className={`acc-btn ${subView === 'inventory_reconciliation' ? 'acc-btn-primary' : 'acc-btn-outline'}`}
            style={{ fontSize: '12px', padding: '6px 14px' }}
            onClick={() => setSubView('inventory_reconciliation')}
          >
            📦 تسوية الجرد الشهري ومقاصة الأمانات
          </button>

          <button
            type="button"
            className={`acc-btn ${subView === 'cashier_ledger' ? 'acc-btn-primary' : 'acc-btn-outline'}`}
            style={{ fontSize: '12px', padding: '6px 14px' }}
            onClick={() => setSubView('cashier_ledger')}
          >
            👤 كشف حساب ومسؤولية الكاشير
          </button>
        </div>

        {/* Global Month Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11.5px', color: '#64748b' }}>شهر التقرير:</span>
          <input
            type="month"
            className="acc-form-input"
            style={{ width: '150px', padding: '4px 8px', height: '32px' }}
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
          />
        </div>
      </div>

      {/* ── VIEW 1: Daily & Monthly Branch Discrepancy Summary Table ── */}
      {subView === 'branch_summary' && (
        <div className="acc-card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>
              🏢 جدول مقارنة عجز وزيادة كل صيدلية (يومياً وشهرياً)
            </h3>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              الفترة: <strong>{filterMonth}</strong>
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="acc-table" style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th>فرع الصيدلية</th>
                  <th>عدد الورديات</th>
                  <th>إجمالي المبيعات</th>
                  <th>الكاش المورد</th>
                  <th style={{ color: '#dc2626' }}>عجز اليوم</th>
                  <th style={{ color: '#2563eb' }}>زيادة اليوم</th>
                  <th style={{ color: '#dc2626' }}>عجز الشهر (رواتب)</th>
                  <th style={{ color: '#2563eb' }}>زيادة الشهر (أمانات)</th>
                  <th>صافي الفروقات</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {branchSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      لا توجد فروع مسجلة
                    </td>
                  </tr>
                ) : (
                  branchSummaries.map((item) => (
                    <tr key={item.branch.id}>
                      <td>
                        <strong>📍 {item.branch.name}</strong>
                      </td>
                      <td>
                        <span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px', fontWeight: '700' }}>
                          {item.shiftCount} وردية
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: '700' }}>
                        {item.sales.toLocaleString()} ج.م
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: '700', color: '#16a34a' }}>
                        {item.actualCash.toLocaleString()} ج.م
                      </td>
                      <td style={{ fontFamily: 'monospace', color: item.todayShortage > 0 ? '#dc2626' : '#94a3b8', fontWeight: item.todayShortage > 0 ? '800' : 'normal' }}>
                        {item.todayShortage > 0 ? `-${item.todayShortage.toLocaleString()} ج.م` : '0'}
                      </td>
                      <td style={{ fontFamily: 'monospace', color: item.todaySurplus > 0 ? '#2563eb' : '#94a3b8', fontWeight: item.todaySurplus > 0 ? '800' : 'normal' }}>
                        {item.todaySurplus > 0 ? `+${item.todaySurplus.toLocaleString()} ج.م` : '0'}
                      </td>
                      <td style={{ fontFamily: 'monospace', color: item.shortage > 0 ? '#dc2626' : '#94a3b8', fontWeight: '800' }}>
                        {item.shortage > 0 ? `-${item.shortage.toLocaleString()} ج.م` : '0'}
                      </td>
                      <td style={{ fontFamily: 'monospace', color: item.surplus > 0 ? '#2563eb' : '#94a3b8', fontWeight: '800' }}>
                        {item.surplus > 0 ? `+${item.surplus.toLocaleString()} ج.م` : '0'}
                      </td>
                      <td style={{
                        fontFamily: 'monospace',
                        fontWeight: '900',
                        color: item.netDiscrepancy === 0 ? '#059669' : item.netDiscrepancy > 0 ? '#2563eb' : '#dc2626',
                      }}>
                        {item.netDiscrepancy > 0 ? `+${item.netDiscrepancy.toLocaleString()}` : `${item.netDiscrepancy.toLocaleString()}`} ج.م
                      </td>
                      <td>
                        <button
                          type="button"
                          className="acc-btn acc-btn-outline"
                          style={{ padding: '2px 8px', fontSize: '11px' }}
                          onClick={() => {
                            setFilterBranchId(item.branch.id);
                            setSubView('ledger');
                          }}
                        >
                          استعراض الورديات 🔍
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── VIEW 2: Detailed Shifts Ledger ── */}
      {subView === 'ledger' && (
        <div className="acc-card" style={{ padding: '16px' }}>
          {/* Filters Bar */}
          <div style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            marginBottom: '14px',
            flexWrap: 'wrap',
          }}>
            <select
              className="acc-form-select"
              value={filterBranchId}
              onChange={(e) => setFilterBranchId(e.target.value)}
              style={{ width: '180px' }}
            >
              <option value="">🏢 جميع الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <select
              className="acc-form-select"
              value={filterCashierId}
              onChange={(e) => setFilterCashierId(e.target.value)}
              style={{ width: '180px' }}
            >
              <option value="">👤 جميع الكاشيرات</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>

            <select
              className="acc-form-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ width: '140px' }}
            >
              <option value="all">🔍 جميع الحالات</option>
              <option value="balanced">🟢 متطابقة فقط</option>
              <option value="shortage">🔴 ورديات بعجز</option>
              <option value="surplus">🔵 ورديات بزيادة</option>
            </select>

            {(filterBranchId || filterCashierId || filterStatus !== 'all') && (
              <button
                type="button"
                className="acc-btn acc-btn-outline"
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={() => {
                  setFilterBranchId('');
                  setFilterCashierId('');
                  setFilterStatus('all');
                }}
              >
                إعادة ضبط الفلاتر ✕
              </button>
            )}
          </div>

          {/* Ledger Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="acc-table" style={{ fontSize: '11.5px' }}>
              <thead>
                <tr>
                  <th>رقم السند</th>
                  <th>فرع الصيدلية</th>
                  <th>الوردية</th>
                  <th>التاريخ والتوقيت</th>
                  <th>الكاشير المسؤول</th>
                  <th>مبيعات الكاش</th>
                  <th>المتوقع بالدرج</th>
                  <th>الفعلي المستلم</th>
                  <th>الفارق</th>
                  <th>الحالة</th>
                  <th>الموظفون المحمل عليهم العجز</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredClosings.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      لا توجد ورديات كاشير مسجلة مطابقة لهذه الفلاتر
                    </td>
                  </tr>
                ) : (
                  filteredClosings.map((c) => {
                    const bName = branches.find((b) => b.id === c.branch_id)?.name || 'الفرع';
                    const shiftLabel = c.shift_type === 'morning' ? '☀️ صباحية' : c.shift_type === 'evening' ? '🌙 مسائية' : '🌌 ليلية';
                    return (
                      <tr key={c.id}>
                        <td>
                          <code style={{ fontSize: '11px', color: '#0369a1', fontWeight: '700' }}>
                            {c.closure_number}
                          </code>
                        </td>
                        <td>
                          <strong>{bName}</strong>
                        </td>
                        <td>{shiftLabel}</td>
                        <td>
                          <div>{c.closing_date}</div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>{c.closing_time || ''}</div>
                        </td>
                        <td>{c.cashier_name}</td>
                        <td style={{ fontFamily: 'monospace' }}>
                          {Number(c.cash_sales || 0).toLocaleString()} ج.م
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                          {Number(c.expected_cash || 0).toLocaleString()} ج.م
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: '800', color: '#16a34a' }}>
                          {Number(c.actual_cash || 0).toLocaleString()} ج.م
                        </td>
                        <td style={{
                          fontFamily: 'monospace',
                          fontWeight: '800',
                          color: c.status === 'balanced' ? '#059669' : c.status === 'shortage' ? '#dc2626' : '#2563eb',
                        }}>
                          {c.difference > 0 ? `+${c.difference}` : c.difference} ج.م
                        </td>
                        <td>
                          {c.status === 'balanced' && (
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '800' }}>
                              🟢 متطابق
                            </span>
                          )}
                          {c.status === 'shortage' && (
                            <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '800' }}>
                              🔴 عجز نقدي
                            </span>
                          )}
                          {c.status === 'surplus' && (
                            <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '800' }}>
                              🔵 زيادة أمانات
                            </span>
                          )}
                        </td>
                        <td>
                          {c.allocated_employees && c.allocated_employees.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              {c.allocated_employees.map((a, i) => (
                                <span key={i} style={{ fontSize: '10px', color: '#991b1b' }}>
                                  • {a.employee_name}: <strong>{a.amount} ج.م</strong>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              type="button"
                              className="acc-btn acc-btn-outline"
                              style={{ padding: '2px 6px', fontSize: '11px' }}
                              onClick={() => handlePrintSingleReceipt(c)}
                              title="طباعة إيصال التقفيل المعزول"
                            >
                              🖨️
                            </button>
                            {onDeleteClosing && (
                              <button
                                type="button"
                                className="acc-btn acc-btn-outline"
                                style={{ padding: '2px 6px', fontSize: '11px', color: '#dc2626' }}
                                onClick={() => {
                                  if (window.confirm(`هل أنت متأكد من حذف تقفيل الوردية ${c.closure_number}؟`)) {
                                    onDeleteClosing(c.id);
                                  }
                                }}
                                title="حذف تقفيل الوردية"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── VIEW 3: Monthly Inventory Stock Reconciliation & Surplus Offsetting ── */}
      {subView === 'inventory_reconciliation' && (
        <div className="acc-card" style={{ padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                📦 تسوية الجرد الشهري ومقاصة أمانات زيادة النقدية (حـ/ 21804)
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#64748b' }}>
                مطابقة زيادة النقدية المحتجزة طوال الشهر مع عجز بضاعة الجرد الفعلي لتحديد العجز المالي الحقيقي للفرع
              </p>
            </div>

            <button
              type="button"
              className="acc-btn acc-btn-outline"
              onClick={handlePrintInventoryReconReport}
              title="طباعة محضر تسوية الجرد والأمانات المعزول A4"
            >
              🖨️ طباعة محضر التسوية (معزول A4)
            </button>
          </div>

          {/* Controls: Branch and Month */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px',
            marginBottom: '16px',
          }}>
            <div>
              <label className="acc-form-label">🏢 فرع الصيدلية المستهدف للجرد:</label>
              <select
                className="acc-form-select"
                value={reconBranchId}
                onChange={(e) => setReconBranchId(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="acc-form-label">📅 شهر الجرد والتسوية:</label>
              <input
                type="month"
                className="acc-form-input"
                value={reconMonth}
                onChange={(e) => setReconMonth(e.target.value)}
              />
            </div>

            <div>
              <label className="acc-form-label" style={{ color: '#b91c1c' }}>
                📦 قيمة عجز بضاعة الجرد الفعلي (ج.م):
              </label>
              <input
                type="number"
                min="0"
                step="1"
                className="acc-form-input"
                value={inventoryStockShortage}
                onChange={(e) => setInventoryStockShortage(Number(e.target.value))}
                placeholder="أدخل قيمة عجز الأصناف بالجرد..."
              />
            </div>
          </div>

          {/* Reconciliation Math & Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '12px',
            marginBottom: '16px',
          }}>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '11px', color: '#991b1b' }}>1. عجز بضاعة الجرد الفعلي للأصناف:</div>
              <div style={{ fontSize: '17px', fontWeight: '900', color: '#b91c1c', fontFamily: 'monospace', marginTop: '4px' }}>
                {reconData.stockShortage.toLocaleString()} ج.م
              </div>
              <div style={{ fontSize: '10px', color: '#7f1d1d', marginTop: '2px' }}>
                أصناف مفقودة أو منصرفة
              </div>
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '11px', color: '#1e40af' }}>2. أمانات زيادة الكاش المحتجزة (حـ/ 21804):</div>
              <div style={{ fontSize: '17px', fontWeight: '900', color: '#1d4ed8', fontFamily: 'monospace', marginTop: '4px' }}>
                + {reconData.accumulatedSurplus.toLocaleString()} ج.م
              </div>
              <div style={{ fontSize: '10px', color: '#1e3a8a', marginTop: '2px' }}>
                مبيعات نقدية تمت دون إدخالها بالـ POS
              </div>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '11px', color: '#166534' }}>3. مبلغ المقاصة المالية المستهلك:</div>
              <div style={{ fontSize: '17px', fontWeight: '900', color: '#15803d', fontFamily: 'monospace', marginTop: '4px' }}>
                - {reconData.surplusOffsetUsed.toLocaleString()} ج.م
              </div>
              <div style={{ fontSize: '10px', color: '#14532d', marginTop: '2px' }}>
                تغطية عجز الأصناف من زيادة الكاش
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)',
              color: '#ffffff',
              borderRadius: '10px',
              padding: '12px',
              boxShadow: '0 4px 12px rgba(185, 28, 28, 0.25)',
            }}>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>4. صافي العجز المالي الفعلي للفرع:</div>
              <div style={{ fontSize: '20px', fontWeight: '900', fontFamily: 'monospace', marginTop: '4px' }}>
                {reconData.netFinancialShortage.toLocaleString()} ج.م
              </div>
              <div style={{ fontSize: '10px', opacity: 0.85, marginTop: '2px' }}>
                المبلغ الحقيقي للتحميل على الموظفين
              </div>
            </div>
          </div>

          {/* Explanation Alert */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '12px',
            color: '#334155',
            lineHeight: '1.6',
            marginBottom: '16px',
          }}>
            <strong>💡 المفهوم المحاسبي الرقابي لتسوية الجرد:</strong>
            <br />
            عندما يقوم الكاشير في الصيدلية ببيع أصناف للعملاء دون تسجيلها على برنامج نقاط البيع (POS)، تظهر زيادة نقدية في درج الكاشير مع حدوث نقص في رصيد مخزون الأدوية.
            يقوم النظام بتجميد هذه الزيادات النقدية بحساب الأمانات <code>21804</code>. وفي نهاية الشهر، تتم مقاصة الزيادة النقدية مع عجز المخزون، ليتم تحديد <strong>العجز المالي الحقيقي فقط ({reconData.netFinancialShortage.toLocaleString()} ج.م)</strong> وتقسيمه بالعدل على طاقم الفرع أو الكاشير المسؤول.
          </div>

          {/* Action to settle remaining shortage into payroll if > 0 */}
          {reconData.netFinancialShortage > 0 && (
            <div style={{
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '10px',
              padding: '14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
            }}>
              <div>
                <strong style={{ color: '#9f1239', fontSize: '13px' }}>
                  تحميل صافي عجز الجرد النهائي ({reconData.netFinancialShortage.toLocaleString()} ج.م) على كشف رواتب طاقم الفرع:
                </strong>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#be123c' }}>
                  سيتم إنشاء استقطاعات آلية وتوزيعها بالتساوي على موظفي صيدلية {reconData.branchName} لشهر {reconMonth}
                </p>
              </div>

              <button
                type="button"
                className="acc-btn acc-btn-primary"
                style={{ background: '#be123c', borderColor: '#9f1239' }}
                onClick={() => {
                  if (onSettleInventoryShortage) {
                    onSettleInventoryShortage(reconBranchId, reconMonth, reconData.netFinancialShortage);
                  } else {
                    alert(`تم اعتماد صافي عجز الجرد بقيمة ${reconData.netFinancialShortage} ج.م وجاري تحويله لرواتب ${reconData.branchName}.`);
                  }
                }}
              >
                ⚡ توزيع الصافي والخصم من الرواتب
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── VIEW 4: Cashier Accountability & History Ledger ── */}
      {subView === 'cashier_ledger' && (
        <div className="acc-card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>
              👤 كشف حساب ومسؤولية الكاشير عن الورديات والعجز
            </h3>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <label style={{ fontSize: '12px', fontWeight: '700' }}>اختر الموظف / الكاشير:</label>
              <select
                className="acc-form-select"
                value={filterCashierId}
                onChange={(e) => setFilterCashierId(e.target.value)}
                style={{ width: '220px' }}
              >
                <option value="">-- حدد كاشير لاستعراض كشفه --</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.jobTitle || 'موظف'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filterCashierId ? (
            <div>
              {/* Cashier Specific Stat Box */}
              {(() => {
                const empClosings = closings.filter((c) => c.cashier_id === filterCashierId);
                const emp = employees.find((e) => e.id === filterCashierId);
                const totalCashHandled = empClosings.reduce((s, c) => s + (Number(c.actual_cash) || 0), 0);
                const empShortageDirect = empClosings.filter((c) => c.status === 'shortage').reduce((s, c) => s + Math.abs(Number(c.difference) || 0), 0);
                const empSurplusDirect = empClosings.filter((c) => c.status === 'surplus').reduce((s, c) => s + (Number(c.difference) || 0), 0);

                return (
                  <div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '10px',
                      marginBottom: '16px',
                      background: '#f8fafc',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                    }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>اسم الكاشير:</div>
                        <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>{emp?.name}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>إجمالي النقدية المسلمة منه:</div>
                        <div style={{ fontSize: '15px', fontWeight: '900', color: '#16a34a', fontFamily: 'monospace' }}>
                          {totalCashHandled.toLocaleString()} ج.م
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>إجمالي العجز في وردياته:</div>
                        <div style={{ fontSize: '15px', fontWeight: '900', color: '#dc2626', fontFamily: 'monospace' }}>
                          {empShortageDirect.toLocaleString()} ج.م
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>إجمالي الزيادات في وردياته:</div>
                        <div style={{ fontSize: '15px', fontWeight: '900', color: '#2563eb', fontFamily: 'monospace' }}>
                          {empSurplusDirect.toLocaleString()} ج.م
                        </div>
                      </div>
                    </div>

                    <table className="acc-table" style={{ fontSize: '11.5px' }}>
                      <thead>
                        <tr>
                          <th>رقم الوردية</th>
                          <th>الفرع</th>
                          <th>التاريخ</th>
                          <th>الوردية</th>
                          <th>الكاش المسلم</th>
                          <th>الفارق</th>
                          <th>الحالة</th>
                          <th>الملاحظات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empClosings.length === 0 ? (
                          <tr>
                            <td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                              لا توجد ورديات مسجلة لهذا الكاشير
                            </td>
                          </tr>
                        ) : (
                          empClosings.map((c) => (
                            <tr key={c.id}>
                              <td><code>{c.closure_number}</code></td>
                              <td>{branches.find((b) => b.id === c.branch_id)?.name}</td>
                              <td>{c.closing_date}</td>
                              <td>{c.shift_type === 'morning' ? 'صباحية' : c.shift_type === 'evening' ? 'مسائية' : 'ليلية'}</td>
                              <td style={{ fontFamily: 'monospace' }}>{Number(c.actual_cash || 0).toLocaleString()} ج.م</td>
                              <td style={{
                                fontFamily: 'monospace',
                                fontWeight: '700',
                                color: c.status === 'balanced' ? '#059669' : c.status === 'shortage' ? '#dc2626' : '#2563eb',
                              }}>
                                {c.difference} ج.م
                              </td>
                              <td>{c.status === 'balanced' ? '🟢 متطابقة' : c.status === 'shortage' ? '🔴 عجز' : '🔵 زيادة'}</td>
                              <td style={{ color: '#64748b' }}>{c.notes || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '36px', color: '#64748b', background: '#f8fafc', borderRadius: '10px' }}>
              <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>👤</span>
              يرجى اختيار اسم الكاشير من القائمة المنسدلة أعلاه لاستعراض كشف وردياته والعجز المسجل عليه.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
