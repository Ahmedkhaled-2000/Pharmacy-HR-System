import React, { useState, useMemo, useEffect } from 'react';
import { printIsolatedReport } from '../../utils/printAccountingReport';

/**
 * NewCashierShiftModal.jsx
 * نافذة تقفيل خزينة وردية الكاشير وحساب العجز والزيادة وتوزيع الاستقطاعات على الموظفين
 */
export default function NewCashierShiftModal({
  isOpen,
  onClose,
  branches = [],
  selectedBranchId = '',
  employees = [],
  treasuries = [],
  onSaveClosing,
}) {
  // Branch & Shift Info
  const [branchId, setBranchId] = useState(selectedBranchId || branches[0]?.id || 'b-1');
  const [shiftType, setShiftType] = useState('morning'); // morning | evening | night
  const [closingDate, setClosingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [closingTime, setClosingTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [cashierId, setCashierId] = useState('');
  const [closureNumber, setClosureNumber] = useState('');

  // POS System Sales Breakdown
  const [openingFloat, setOpeningFloat] = useState(0); // رصيد عهدة الصباح/الفكة
  const [grossSales, setGrossSales] = useState(0); // إجمالي مبيعات الوردية
  const [cashSales, setCashSales] = useState(0); // مبيعات الكاش
  const [visaSales, setVisaSales] = useState(0); // مبيعات فيزا
  const [walletSales, setWalletSales] = useState(0); // مبيعات محفظة / انستاباي
  const [creditSales, setCreditSales] = useState(0); // مبيعات آجل / تعاقدات
  const [drawerExpenses, setDrawerExpenses] = useState(0); // نثريات ومصروفات نقدية من الدرج
  const [cashReturns, setCashReturns] = useState(0); // مرتجعات نقدية للعملاء

  // Actual Cash Count
  const [showDenominations, setShowDenominations] = useState(false);
  const [denominations, setDenominations] = useState({
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    1: 0,
    0.5: 0,
  });
  const [directActualCash, setDirectActualCash] = useState(0);
  const [notes, setNotes] = useState('');

  // Shortage Allocation Mode: 'single' (الكاشير المسؤول فقط) | 'custom_group' (موظفون محددون) | 'all_branch' (جميع موظفي الفرع بالتساوي)
  const [allocationMode, setAllocationMode] = useState('single');
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);
  const [customSplits, setCustomSplits] = useState({}); // { empId: amount }

  // Sync default branch cashier
  const branchEmployees = useMemo(() => {
    if (!branchId) return employees;
    return employees.filter((e) => {
      const bMatches = e.branches?.some((b) => b.branchId === branchId) || e.branchId === branchId || e.branch === branchId;
      return bMatches;
    });
  }, [employees, branchId]);

  useEffect(() => {
    if (branchEmployees.length > 0 && (!cashierId || !branchEmployees.some((e) => e.id === cashierId))) {
      setCashierId(branchEmployees[0].id);
    }
  }, [branchEmployees, cashierId]);

  // Generate closure number
  useEffect(() => {
    const dStr = (closingDate || '').replace(/-/g, '').slice(2);
    const rnd = Math.floor(100 + Math.random() * 900);
    setClosureNumber(`TR-CSH-${dStr}-${rnd}`);
  }, [closingDate, branchId, shiftType]);

  // Calculate denominations total
  const denominationsTotal = useMemo(() => {
    return Object.entries(denominations).reduce((acc, [denom, count]) => {
      return acc + (Number(denom) * Number(count || 0));
    }, 0);
  }, [denominations]);

  // Actual Cash determined by mode
  const actualCash = showDenominations ? denominationsTotal : Number(directActualCash || 0);

  // Expected Cash calculation
  // Expected = عهدة أول المدة + مبيعات الكاش - المصروفات النثرية - المرتجعات النقدية
  const expectedCash = useMemo(() => {
    const total = Number(openingFloat || 0) + Number(cashSales || 0) - Number(drawerExpenses || 0) - Number(cashReturns || 0);
    return Math.max(0, total);
  }, [openingFloat, cashSales, drawerExpenses, cashReturns]);

  // Discrepancy
  const difference = useMemo(() => {
    return Number((actualCash - expectedCash).toFixed(2));
  }, [actualCash, expectedCash]);

  const status = difference === 0 ? 'balanced' : difference < 0 ? 'shortage' : 'surplus';
  const shortageAmount = Math.abs(difference);

  // Current Cashier Name
  const selectedCashier = employees.find((e) => e.id === cashierId);
  const cashierName = selectedCashier?.name || 'الكاشير المسؤول';

  const branchObj = branches.find((b) => b.id === branchId);
  const branchName = branchObj?.name || 'فرع الصيدلية';

  // Manage Allocations
  useEffect(() => {
    if (status !== 'shortage') return;

    if (allocationMode === 'single') {
      if (cashierId) {
        setSelectedEmpIds([cashierId]);
        setCustomSplits({ [cashierId]: shortageAmount });
      }
    } else if (allocationMode === 'all_branch') {
      const bEmps = branchEmployees.length > 0 ? branchEmployees : [selectedCashier].filter(Boolean);
      const ids = bEmps.map((e) => e.id);
      setSelectedEmpIds(ids);
      const splitEach = ids.length > 0 ? Number((shortageAmount / ids.length).toFixed(2)) : shortageAmount;
      const splits = {};
      ids.forEach((id) => {
        splits[id] = splitEach;
      });
      setCustomSplits(splits);
    }
  }, [status, allocationMode, shortageAmount, cashierId, branchEmployees, selectedCashier]);

  // Toggle employee in custom group
  const handleToggleEmp = (empId) => {
    let nextIds;
    if (selectedEmpIds.includes(empId)) {
      nextIds = selectedEmpIds.filter((id) => id !== empId);
    } else {
      nextIds = [...selectedEmpIds, empId];
    }
    setSelectedEmpIds(nextIds);

    // Auto split equally among selected
    const splitEach = nextIds.length > 0 ? Number((shortageAmount / nextIds.length).toFixed(2)) : 0;
    const splits = {};
    nextIds.forEach((id) => {
      splits[id] = splitEach;
    });
    setCustomSplits(splits);
  };

  const handleCustomSplitChange = (empId, val) => {
    setCustomSplits((prev) => ({
      ...prev,
      [empId]: Number(val || 0),
    }));
  };

  // Build allocated deductions list
  const allocatedList = useMemo(() => {
    if (status !== 'shortage') return [];
    return selectedEmpIds.map((id) => {
      const emp = employees.find((e) => e.id === id);
      return {
        employee_id: id,
        employee_name: emp?.name || 'موظف',
        amount: Number(customSplits[id] || 0),
      };
    });
  }, [status, selectedEmpIds, employees, customSplits]);

  const allocatedTotal = allocatedList.reduce((s, a) => s + a.amount, 0);

  // Print Isolated Shift Receipt
  const handlePrintReceipt = () => {
    const shiftLabel = shiftType === 'morning' ? 'الوردية الصباحية (08:00 - 16:00)' : shiftType === 'evening' ? 'الوردية المسائية (16:00 - 00:00)' : 'الوردية الليلية (00:00 - 08:00)';
    const statusLabel = status === 'balanced' ? '🟢 مطابقة تامة' : status === 'shortage' ? `🔴 عجز نقدي (${shortageAmount.toLocaleString()} ج.م)` : `🔵 زيادة نقدية (${difference.toLocaleString()} ج.م)`;

    const allocationRows = allocatedList.map((a, idx) => [
      String(idx + 1),
      a.employee_name,
      `${a.amount.toLocaleString()} ج.م`,
      `خصم عجز وردية صيدلية من راتب الشهر (${closingDate})`,
    ]);

    printIsolatedReport({
      title: 'إيصال استلام وتقفيل وردية كاشير الصيدلية',
      subtitle: `مطابقة النقدية والعجز والزيادة اليومية - ${branchName}`,
      documentNumber: closureNumber,
      date: `${closingDate} ${closingTime}`,
      metadata: [
        { label: 'الفرع والصيدلية', value: branchName },
        { label: 'نوع الوردية', value: shiftLabel },
        { label: 'الكاشير المسؤول', value: cashierName },
        { label: 'رقم السند', value: closureNumber },
        { label: 'حالة المطابقة', value: statusLabel },
        { label: 'طريقة التحصيل', value: 'نظام نقاط البيع POS' },
      ],
      summaryCards: [
        { title: 'إجمالي المبيعات', value: `${grossSales.toLocaleString()} ج.م`, color: '#0f766e' },
        { title: 'النقدية المتوقعة بالدرج', value: `${expectedCash.toLocaleString()} ج.م`, color: '#0284c7' },
        { title: 'النقدية الفعلية المسلمة', value: `${actualCash.toLocaleString()} ج.م`, color: '#16a34a' },
        {
          title: status === 'shortage' ? 'قيمة العجز النقدي' : status === 'surplus' ? 'قيمة الزيادة النقدية' : 'صافي الفروقات',
          value: `${Math.abs(difference).toLocaleString()} ج.م`,
          color: status === 'shortage' ? '#dc2626' : status === 'surplus' ? '#2563eb' : '#059669',
        },
      ],
      headers: ['م', 'بند حركة الوردية / اسم الموظف المستقطع منه', 'المبلغ', 'ملاحظات وتوجيه محاسبي'],
      rows: [
        ['1', 'رصيد عهدة أول الوردية (الافتتاحية والفكة)', `${openingFloat.toLocaleString()} ج.م`, 'عهدة مستردة إلى الدرج'],
        ['2', 'مبيعات الكاش النقدية بالوردية', `${cashSales.toLocaleString()} ج.م`, 'حساب مبيعات نقدية'],
        ['3', 'مبيعات الشبكة والفيزا والبطاقات', `${visaSales.toLocaleString()} ج.م`, 'حساب بنك / نقاط بيع POS'],
        ['4', 'مبيعات المحافظ الإلكترونية وإنستاباي', `${walletSales.toLocaleString()} ج.م`, 'حساب المحافظ الإلكترونية'],
        ['5', 'مبيعات آجل وعملاء التعاقدات', `${creditSales.toLocaleString()} ج.م`, 'حساب مدينو عملاء'],
        ['6', 'نثريات ومصروفات مدفوعة من الدرج بإيصال', `-${drawerExpenses.toLocaleString()} ج.م`, 'حساب مصروفات عمومية'],
        ['7', 'مرتجعات نقدية للعملاء من الدرج', `-${cashReturns.toLocaleString()} ج.م`, 'مردودات مبيعات'],
        ['8', 'إجمالي النقدية الواجب توفرها بالدرج', `${expectedCash.toLocaleString()} ج.م`, 'معادلة السيستم المحاسبية'],
        ['9', 'إجمالي النقدية المحصورة فعلياً بالدرج', `${actualCash.toLocaleString()} ج.م`, 'الجرد الفعلي للكاش'],
        ['10', status === 'shortage' ? 'عجز نقدي مطلوب تحصيله' : status === 'surplus' ? 'زيادة نقدية محتجزة بالأمانات' : 'تطابق الخزينة', `${Math.abs(difference).toLocaleString()} ج.م`, status === 'surplus' ? 'معلق بحساب 21804 لمقاصة الجرد الشهري' : 'تسوية'],
        ...allocationRows,
      ],
      footerNotes: `تم إغلاق الوردية والمصادقة على الجرد الفعلي ومسؤولية الكاشير. في حال العجز يتم خصم المبالغ من مسير الرواتب. في حال الزيادة يتم تجميدها بحساب أمانات تسوية الجرد (حـ/ 21804).`,
      companyName: 'مجموعة صيدليات الإدارة الطبية',
    });
  };

  // Submit Handler
  const handleSubmit = (e) => {
    e.preventDefault();

    if (!branchId) {
      alert('يرجى تحديد فرع الصيدلية.');
      return;
    }
    if (!cashierId) {
      alert('يرجى اختيار الكاشير المسؤول عن الوردية.');
      return;
    }

    if (status === 'shortage' && allocatedList.length === 0) {
      alert('يوجد عجز نقدي! يجب تحديد الموظف أو الموظفين الذين سيتم تحميل العجز عليهم للخصم من الراتب.');
      return;
    }

    if (status === 'shortage' && Math.abs(allocatedTotal - shortageAmount) > 1) {
      const confirmDiff = window.confirm(
        `تنبيه: مجموع المبالغ الموزعة على الموظفين (${allocatedTotal} ج.م) لا يتطابق تماماً مع إجمالي العجز (${shortageAmount} ج.م).\nهل تود المتابعة وحفظ هذا التوزيع؟`
      );
      if (!confirmDiff) return;
    }

    // 1. Prepare Cashier Closing Object
    const closingRecord = {
      id: `close-${Date.now()}`,
      closure_number: closureNumber,
      branch_id: branchId,
      shift_type: shiftType,
      closing_date: closingDate,
      closing_time: closingTime,
      cashier_id: cashierId,
      cashier_name: cashierName,
      opening_float: Number(openingFloat || 0),
      gross_sales: Number(grossSales || 0),
      cash_sales: Number(cashSales || 0),
      visa_sales: Number(visaSales || 0),
      wallet_sales: Number(walletSales || 0),
      credit_sales: Number(creditSales || 0),
      drawer_expenses: Number(drawerExpenses || 0),
      cash_returns: Number(cashReturns || 0),
      expected_cash: expectedCash,
      actual_cash: actualCash,
      difference: difference,
      status: status,
      notes: notes || (status === 'balanced' ? 'مطابقة تامة' : status === 'shortage' ? 'تسوية عجز وردية' : 'زيادة نقدية محتجزة بالأمانات'),
      allocated_employees: allocatedList,
      created_at: new Date().toISOString(),
    };

    // 2. Generate Automated Journal Entry
    // Find Treasury account for branch
    const branchTreasury = treasuries.find((t) => t.branch_id === branchId) || treasuries[0];
    const treasuryAccountId = branchTreasury?.account_id || 'acc-11101';

    const lines = [
      // Debit: Actual cash deposited into Branch Treasury
      {
        account_id: treasuryAccountId,
        debit: actualCash,
        credit: 0,
        cost_center_id: branchId,
        line_desc: `توريد نقدية كاشير وردية (${shiftType}) - ${branchName} سند ${closureNumber}`,
      },
    ];

    if (status === 'shortage') {
      // Debit: Shortage receivable from employees (11603)
      lines.push({
        account_id: 'acc-11603', // عجز خزائن الفروع تحت التحصيل من الرواتب
        debit: shortageAmount,
        credit: 0,
        cost_center_id: branchId,
        line_desc: `إثبات عجز نقدي وردية كاشير محمل على الرواتب (${allocatedList.map((a) => a.employee_name).join('، ')})`,
      });
    }

    if (status === 'surplus') {
      // Credit: Surplus held in escrow (21804)
      lines.push({
        account_id: 'acc-21804', // أمانات زيادات نقدية الفروع - تحت تسوية الجرد الشهري
        debit: 0,
        credit: difference,
        cost_center_id: branchId,
        line_desc: `أمانات زيادة نقدية كاشير محتجزة لمقاصة الجرد الشهري للأصناف - ${branchName}`,
      });
    }

    // Credit: Sales and opening float offset
    lines.push({
      account_id: 'acc-41101', // مبيعات أدوية نقدية
      debit: 0,
      credit: Number(cashSales || 0),
      cost_center_id: branchId,
      line_desc: `إثبات مبيعات كاش وردية كاشير ${branchName}`,
    });

    const journalEntry = {
      id: `jv-cashier-${closureNumber}-${Date.now()}`,
      entry_number: `JV-${closureNumber}`,
      entry_date: closingDate,
      doc_type: 'cashier_closing',
      branch_id: branchId,
      narration: `تقفيل وردية كاشير صيدلية ${branchName} (${status === 'balanced' ? 'متطابقة' : status === 'shortage' ? `عجز ${shortageAmount} ج.م` : `زيادة ${difference} ج.م`})`,
      doc_reference: closureNumber,
      total_debit: actualCash + (status === 'shortage' ? shortageAmount : 0),
      total_credit: Number(cashSales || 0) + (status === 'surplus' ? difference : 0),
      lines,
      is_posted: true,
      created_at: new Date().toISOString(),
    };

    // 3. Prepare Payroll Deductions for HR engine (state.adjustments)
    const payrollDeductions = allocatedList.map((a) => ({
      id: `adj-shortage-${Date.now()}-${a.employee_id}`,
      employeeId: a.employee_id,
      branchId: branchId,
      type: 'deduction',
      amount: a.amount,
      reason: `عجز خزينة وردية كاشير صيدلية (${branchName}) - سند ${closureNumber}`,
      date: closingDate,
      createdAt: new Date().toISOString(),
      closure_number: closureNumber,
      isCashierShortage: true,
    }));

    onSaveClosing(closingRecord, journalEntry, payrollDeductions);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="acc-modal-overlay" onClick={onClose}>
      <div
        className="acc-modal acc-modal-lg"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '900px', width: '95vw' }}
      >
        {/* Header */}
        <div className="acc-modal-header" style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px', background: '#dcfce7', padding: '6px 10px', borderRadius: '12px' }}>
              🔒
            </span>
            <div>
              <h2 style={{ color: '#166534', margin: 0, fontSize: '18px', fontWeight: '800' }}>
                تقفيل خزينة وردية الكاشير والعجز والزيادة
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#475569' }}>
                مطابقة مبيعات السيستم مع الجرد الفعلي للنقدية بالدرج، وتوزيع العجز على الموظفين أو تجميد الزيادات لمقاصة الجرد
              </p>
            </div>
          </div>
          <button type="button" className="acc-action-icon-btn" onClick={onClose} style={{ fontSize: '18px' }}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="acc-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Row 1: Branch, Shift, Date, Time */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div>
                <label className="acc-form-label">🏢 فرع الصيدلية:</label>
                <select
                  className="acc-form-select"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  required
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="acc-form-label">⏰ نوع الوردية:</label>
                <select
                  className="acc-form-select"
                  value={shiftType}
                  onChange={(e) => setShiftType(e.target.value)}
                >
                  <option value="morning">☀️ وردية صباحية (08:00 - 16:00)</option>
                  <option value="evening">🌙 وردية مسائية (16:00 - 00:00)</option>
                  <option value="night">🌌 وردية ليلية (00:00 - 08:00)</option>
                </select>
              </div>

              <div>
                <label className="acc-form-label">👤 الكاشير المسؤول:</label>
                <select
                  className="acc-form-select"
                  value={cashierId}
                  onChange={(e) => setCashierId(e.target.value)}
                  required
                >
                  {branchEmployees.length === 0 && (
                    <option value="">لا يوجد موظفون مسجلون بهذا الفرع</option>
                  )}
                  {branchEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.jobTitle || 'صيدلي / كاشير'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="acc-form-label">📅 التاريخ والتوقيت:</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="date"
                    className="acc-form-input"
                    value={closingDate}
                    onChange={(e) => setClosingDate(e.target.value)}
                    style={{ flex: 1 }}
                    required
                  />
                  <input
                    type="time"
                    className="acc-form-input"
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                    style={{ width: '95px' }}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Section: POS Sales Breakdown */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>
                  📊 تفصيل مبيعات السيستم ونقاط البيع (POS System):
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  رقم السند: <code>{closureNumber}</code>
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div>
                  <label className="acc-form-label" style={{ fontSize: '11px' }}>💵 عهدة افتتاحية (فكة):</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="acc-form-input"
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="acc-form-label" style={{ fontSize: '11px' }}>💰 مبيعات الكاش:</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="acc-form-input"
                    value={cashSales}
                    onChange={(e) => setCashSales(Number(e.target.value))}
                    required
                  />
                </div>

                <div>
                  <label className="acc-form-label" style={{ fontSize: '11px' }}>💳 شبكة وفيزا:</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="acc-form-input"
                    value={visaSales}
                    onChange={(e) => setVisaSales(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="acc-form-label" style={{ fontSize: '11px' }}>📱 محفظة / إنستاباي:</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="acc-form-input"
                    value={walletSales}
                    onChange={(e) => setWalletSales(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="acc-form-label" style={{ fontSize: '11px' }}>🧾 آجل وتعاقدات:</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="acc-form-input"
                    value={creditSales}
                    onChange={(e) => setCreditSales(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="acc-form-label" style={{ fontSize: '11px', color: '#b91c1c' }}>🧾 نثريات من الدرج (-):</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="acc-form-input"
                    value={drawerExpenses}
                    onChange={(e) => setDrawerExpenses(Number(e.target.value))}
                  />
                </div>

                <div>
                  <label className="acc-form-label" style={{ fontSize: '11px', color: '#b91c1c' }}>🔄 مرتجع كاش للعميل (-):</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="acc-form-input"
                    value={cashReturns}
                    onChange={(e) => setCashReturns(Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Formula explanation bar */}
              <div style={{
                marginTop: '10px',
                padding: '8px 12px',
                background: '#f1f5f9',
                borderRadius: '8px',
                fontSize: '11.5px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#334155',
              }}>
                <span>
                  🧮 النقدية المتوقعة بالدرج = عهدة أول المدة ({openingFloat}) + كاش المبيعات ({cashSales}) - نثريات ({drawerExpenses}) - مرتجعات ({cashReturns})
                </span>
                <strong style={{ color: '#0369a1', fontSize: '14px', fontFamily: 'monospace' }}>
                  = {expectedCash.toLocaleString()} ج.م
                </strong>
              </div>
            </div>

            {/* Section: Actual Cash Handover */}
            <div style={{
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              borderRadius: '12px',
              padding: '14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>
                  💵 حصر النقدية الفعلية المسلمة من الكاشير:
                </span>
                <button
                  type="button"
                  className="acc-btn acc-btn-outline"
                  style={{ padding: '3px 10px', fontSize: '11px' }}
                  onClick={() => setShowDenominations(!showDenominations)}
                >
                  {showDenominations ? '🔢 إدخال المبلغ الإجمالي مباشرة' : '🧮 فتح عدّاد الفئات النقدية (200، 100...)'}
                </button>
              </div>

              {showDenominations ? (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                  gap: '8px',
                  background: '#f8fafc',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                }}>
                  {[200, 100, 50, 20, 10, 5, 1, 0.5].map((denom) => (
                    <div key={denom} style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                        فئة {denom} ج
                      </span>
                      <input
                        type="number"
                        min="0"
                        className="acc-form-input"
                        style={{ textAlign: 'center', marginTop: '3px', fontWeight: '700' }}
                        value={denominations[denom] || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const val = Number(e.target.value || 0);
                          setDenominations((prev) => ({ ...prev, [denom]: val }));
                        }}
                      />
                      <div style={{ fontSize: '10px', color: '#0284c7', marginTop: '2px', fontFamily: 'monospace' }}>
                        {(denom * (denominations[denom] || 0)).toLocaleString()} ج
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ flex: 1 }}>
                    <label className="acc-form-label" style={{ fontSize: '12px' }}>
                      إجمالي النقدية المحصورة الفعلية في الدرج (ج.م):
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className="acc-form-input"
                      style={{ fontSize: '18px', fontWeight: '900', color: '#0f172a', fontFamily: 'monospace' }}
                      value={directActualCash}
                      onChange={(e) => setDirectActualCash(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Comparison & Difference Result Banner */}
              <div style={{
                marginTop: '12px',
                padding: '12px 16px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: status === 'balanced' ? '#f0fdf4' : status === 'shortage' ? '#fef2f2' : '#eff6ff',
                border: `1.5px solid ${status === 'balanced' ? '#86efac' : status === 'shortage' ? '#fca5a5' : '#93c5fd'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '24px' }}>
                    {status === 'balanced' ? '🟢' : status === 'shortage' ? '🔴' : '🔵'}
                  </span>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '800', color: status === 'balanced' ? '#166534' : status === 'shortage' ? '#991b1b' : '#1e40af' }}>
                      {status === 'balanced' && 'الخزينة متطابقة 100% (لا يوجد عجز ولا زيادة)'}
                      {status === 'shortage' && `يوجد عجز نقدي في الدرج بمقدار: ${shortageAmount.toLocaleString()} ج.م`}
                      {status === 'surplus' && `يوجد زيادة نقدية في الدرج بمقدار: ${difference.toLocaleString()} ج.م`}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      المتوقع: <strong>{expectedCash.toLocaleString()} ج.م</strong> | الفعلي المستلم: <strong>{actualCash.toLocaleString()} ج.م</strong>
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>صافي الفرق:</div>
                  <div style={{
                    fontSize: '20px',
                    fontWeight: '900',
                    fontFamily: 'monospace',
                    color: status === 'balanced' ? '#16a34a' : status === 'shortage' ? '#dc2626' : '#2563eb',
                  }}>
                    {difference > 0 ? `+${difference.toLocaleString()}` : `${difference.toLocaleString()}`} ج.م
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Shortage Allocation (if shortage) */}
            {status === 'shortage' && (
              <div style={{
                background: '#fff1f2',
                border: '1.5px solid #fecdd3',
                borderRadius: '12px',
                padding: '14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '18px' }}>👥</span>
                  <strong style={{ fontSize: '13px', color: '#9f1239' }}>
                    توزيع العجز النقدي ({shortageAmount.toLocaleString()} ج.م) والخصم من الرواتب:
                  </strong>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`acc-btn ${allocationMode === 'single' ? 'acc-btn-primary' : 'acc-btn-outline'}`}
                    style={{ fontSize: '11.5px', padding: '5px 12px' }}
                    onClick={() => setAllocationMode('single')}
                  >
                    👤 تحميل العجز بالكامل على الكاشير ({cashierName})
                  </button>
                  <button
                    type="button"
                    className={`acc-btn ${allocationMode === 'all_branch' ? 'acc-btn-primary' : 'acc-btn-outline'}`}
                    style={{ fontSize: '11.5px', padding: '5px 12px' }}
                    onClick={() => setAllocationMode('all_branch')}
                  >
                    🏢 توزيع العجز بالتساوي على جميع موظفي الفرع ({branchEmployees.length} موظف)
                  </button>
                  <button
                    type="button"
                    className={`acc-btn ${allocationMode === 'custom_group' ? 'acc-btn-primary' : 'acc-btn-outline'}`}
                    style={{ fontSize: '11.5px', padding: '5px 12px' }}
                    onClick={() => setAllocationMode('custom_group')}
                  >
                    ✍️ اختيار موظفين محددين وتحديد مبالغ مخصصة
                  </button>
                </div>

                {/* Employee Selection List */}
                <div style={{
                  background: '#ffffff',
                  border: '1px solid #fecdd3',
                  borderRadius: '10px',
                  padding: '10px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                }}>
                  <table className="acc-table" style={{ fontSize: '11.5px', margin: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>اختيار</th>
                        <th>اسم الموظف</th>
                        <th>المسمى الوظيفي</th>
                        <th style={{ width: '130px' }}>قيمة الخصم المحملة (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchEmployees.map((emp) => {
                        const isSelected = selectedEmpIds.includes(emp.id);
                        return (
                          <tr key={emp.id} style={{ background: isSelected ? '#fff1f2' : 'transparent' }}>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleEmp(emp.id)}
                              />
                            </td>
                            <td>
                              <strong>{emp.name}</strong>
                              {emp.id === cashierId && (
                                <span style={{
                                  background: '#0284c7',
                                  color: '#fff',
                                  fontSize: '10px',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  marginRight: '6px',
                                }}>
                                  الكاشير المسؤول
                                </span>
                              )}
                            </td>
                            <td style={{ color: '#64748b' }}>{emp.jobTitle || 'موظف'}</td>
                            <td>
                              {isSelected ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  className="acc-form-input"
                                  style={{ padding: '2px 6px', height: '28px', fontFamily: 'monospace', fontWeight: '700' }}
                                  value={customSplits[emp.id] ?? ''}
                                  onChange={(e) => handleCustomSplitChange(emp.id, e.target.value)}
                                />
                              ) : (
                                <span style={{ color: '#94a3b8' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Summary Alert */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '8px',
                  fontSize: '11px',
                  color: '#9f1239',
                }}>
                  <span>
                    💡 سيتم ترحيل هذه المبالغ فورياً في كشف رواتب الموظفين كاستقطاع عجز خزينة لشهر {closingDate.slice(0, 7)}
                  </span>
                  <strong>
                    إجمالي الموزع: {allocatedTotal.toLocaleString()} ج.م من أصل {shortageAmount.toLocaleString()} ج.م
                  </strong>
                </div>
              </div>
            )}

            {/* Section: Surplus Escrow Notice (if surplus) */}
            {status === 'surplus' && (
              <div style={{
                background: '#eff6ff',
                border: '1.5px solid #bfdbfe',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}>
                <span style={{ fontSize: '26px' }}>📦</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#1e40af' }}>
                    أمانات زيادة نقدية محتجزة لمقاصة الجرد الشهري:
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: '#1e3a8a', lineHeight: '1.5' }}>
                    تم توجيه مبلغ الزيادة (<strong>{difference.toLocaleString()} ج.م</strong>) آلياً إلى حساب:
                    <br />
                    <code>21804 - أمانات زيادات نقدية الفروع (تحت تسوية الجرد الشهري)</code>
                    <br />
                    حيث يتم الاحتفاظ بهذه المبالغ حتى نهاية الجرد الشهري للصيدلية، للتحقق مما إذا كانت هناك أصناف تم صرفها للعملاء وتحصيل قيمتها دون تسجيلها في نظام نقاط البيع POS، ومقاصتها لتحديد العجز المالي الفعلي.
                  </p>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="acc-form-label">📝 ملاحظات إغلاق الوردية:</label>
              <textarea
                className="acc-form-textarea"
                rows={2}
                placeholder="أي ملاحظات حول الوردية، تسليم الدرج، فواتير معلقة..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="acc-modal-footer" style={{ justifyContent: 'space-between' }}>
            <button
              type="button"
              className="acc-btn acc-btn-outline"
              onClick={handlePrintReceipt}
              title="طباعة إيصال استلام وتقفيل الوردية في بيئة A4 معزولة"
            >
              🖨️ طباعة إيصال الوردية (معزول A4)
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="acc-btn acc-btn-outline" onClick={onClose}>
                إلغاء
              </button>
              <button type="submit" className="acc-btn acc-btn-primary">
                💾 حفظ واعتماد تقفيل الخزينة
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
