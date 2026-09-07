/**
 * aiAccountingEngine.js
 * محرك الذكاء الاصطناعي المالي لمنظومة حسابات الصيدليات:
 * 1. تحليل الأوامر اللغوية الطبيعية وتوليد مسودة القيود المتزنة آلياً (NLP to Journal Entry)
 * 2. رادار التدقيق المالي وكشف الشذوذ والنزيف المحاسبي (AI Audit Radar)
 * 3. التنبؤ بالسيولة النقدية ومواعيد الاستحقاق (Cash Flow Forecasting)
 */

/**
 * 1. استخراج المبالغ الرقمية من النص العربي
 */
function extractAmountFromText(text) {
  // Regex to match numbers with optional commas/decimals followed or preceded by currency words
  const clean = text.replace(/،/g, ',');
  const matches = clean.match(/(\d+(?:[.,]\d+)?)/g);
  if (!matches || matches.length === 0) return 0;

  // Filter out year-like numbers (e.g. 2026) if other amounts exist
  const numbers = matches.map((m) => parseFloat(m.replace(/,/g, '')));
  const plausible = numbers.filter((n) => n !== 2024 && n !== 2025 && n !== 2026 && n > 0);
  return plausible.length > 0 ? plausible[0] : numbers[0] || 0;
}

/**
 * 2. المساعد الذكي لتوليد القيود المحاسبية من النصوص العامية والطبيعية
 */
export function parseNaturalLanguageJournalPrompt(prompt, accounts = [], branches = [], treasuries = [], costCenters = []) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return { error: 'يرجى كتابة نص المعاملة المالية المراد تسجيلها.' };
  }

  const p = prompt.toLowerCase();
  const amount = extractAmountFromText(prompt);

  // Helper find account by code or keywords
  const findAccByCode = (codePrefix) => accounts.find((a) => a.code && a.code.startsWith(codePrefix) && !a.is_parent);
  const findAccByKeyword = (kw) => accounts.find((a) => (a.name_ar && a.name_ar.includes(kw)) || (a.name_en && a.name_en.toLowerCase().includes(kw)));
  const findBranch = () => {
    if (p.includes('سموحة') || p.includes('سموحه')) return branches.find((b) => b.name && b.name.includes('سموحة'))?.id || '';
    if (p.includes('عجمي') || p.includes('العجمي')) return branches.find((b) => b.name && b.name.includes('العجمي'))?.id || '';
    if (p.includes('رمل') || p.includes('محطة الرمل')) return branches.find((b) => b.name && b.name.includes('رمل'))?.id || '';
    if (p.includes('إدارة') || p.includes('رئيسي')) return branches.find((b) => b.name && b.name.includes('رئيسي'))?.id || '';
    return branches[0]?.id || '';
  };

  const detectedBranchId = findBranch();
  const detectedCostCenterId = costCenters.find((c) => c.branch_id === detectedBranchId)?.id || '';

  // Identify payment source (Cash vs Bank vs Wallet)
  let creditAccountId = '';
  let creditAccountName = '';

  if (p.includes('بنك مصر')) {
    const acc = findAccByKeyword('بنك مصر') || findAccByCode('11202');
    creditAccountId = acc?.id;
    creditAccountName = acc?.name_ar || 'بنك مصر';
  } else if (p.includes('بنك cib') || p.includes('تجاري دولي') || p.includes('cib')) {
    const acc = findAccByKeyword('CIB') || findAccByKeyword('التجاري الدولي') || findAccByCode('11203');
    creditAccountId = acc?.id;
    creditAccountName = acc?.name_ar || 'البنك التجاري الدولي (CIB)';
  } else if (p.includes('بنك') || p.includes('أهلي') || p.includes('اهلي') || p.includes('شيك')) {
    const acc = findAccByKeyword('الأهلي') || findAccByCode('11201');
    creditAccountId = acc?.id;
    creditAccountName = acc?.name_ar || 'البنك الأهلي المصري';
  } else if (p.includes('فودافون') || p.includes('محفظة') || p.includes('كاش') && (p.includes('تحويل') || p.includes('سحب'))) {
    const acc = findAccByKeyword('فودافون') || findAccByCode('11105');
    creditAccountId = acc?.id;
    creditAccountName = acc?.name_ar || 'محفظة فودافون كاش';
  } else if (p.includes('إنستاباي') || p.includes('انستاباي') || p.includes('instapay')) {
    const acc = findAccByKeyword('إنستاباي') || findAccByCode('11107');
    creditAccountId = acc?.id;
    creditAccountName = acc?.name_ar || 'حساب تحويلات إنستاباي';
  } else {
    // Default cash treasury based on branch or main
    if (p.includes('سموحة') || p.includes('سموحه')) {
      const acc = findAccByKeyword('سموحة') || findAccByCode('11102');
      creditAccountId = acc?.id;
      creditAccountName = acc?.name_ar || 'خزينة صيدلية سموحة';
    } else if (p.includes('عجمي') || p.includes('العجمي')) {
      const acc = findAccByKeyword('العجمي') || findAccByCode('11103');
      creditAccountId = acc?.id;
      creditAccountName = acc?.name_ar || 'خزينة صيدلية العجمي';
    } else if (p.includes('رمل') || p.includes('محطة الرمل')) {
      const acc = findAccByKeyword('الرمل') || findAccByCode('11104');
      creditAccountId = acc?.id;
      creditAccountName = acc?.name_ar || 'خزينة صيدلية محطة الرمل';
    } else {
      const acc = findAccByCode('11101') || findAccByCode('111');
      creditAccountId = acc?.id;
      creditAccountName = acc?.name_ar || 'خزينة الإدارة الرئيسية';
    }
  }

  // Identify Transaction Type & Debit Account
  let debitAccountId = '';
  let debitAccountName = '';
  let narration = '';
  let transactionCategory = 'expense';
  let recognizedRule = '';

  // 1. Electricity / Utilities (كهرباء / مياه / غاز)
  if (p.includes('كهرباء') || p.includes('كهربا')) {
    const acc = findAccByCode('622') || findAccByKeyword('كهرباء');
    debitAccountId = acc?.id;
    debitAccountName = acc?.name_ar || 'كهرباء وإنارة ومرافق صيدليات';
    narration = `سداد فاتورة استهلاك الكهرباء - ${creditAccountName}`;
    recognizedRule = 'مصروفات تشغيلية ومرافق (كهرباء)';
  } else if (p.includes('مياه') || p.includes('ميه') || p.includes('غاز')) {
    const acc = findAccByCode('622') || findAccByKeyword('مرافق');
    debitAccountId = acc?.id;
    debitAccountName = acc?.name_ar || 'مرافق ومياه وغاز';
    narration = `سداد فاتورة مرافق ومياه - ${creditAccountName}`;
    recognizedRule = 'مصروفات تشغيلية ومرافق';
  }
  // 2. Rent (إيجار الصيدلية أو المخزن)
  else if (p.includes('إيجار') || p.includes('ايجار')) {
    const acc = findAccByCode('621') || findAccByKeyword('إيجار');
    debitAccountId = acc?.id;
    debitAccountName = acc?.name_ar || 'إيجارات مقرات وفروع الصيدليات';
    narration = `سداد القيمة الإيجارية الشهرية لمقر الصيدلية`;
    recognizedRule = 'مصروفات إيجار الفروع';
  }
  // 3. Maintenance (صيانة تكييفات / ثلاجات أدوية / شبكات)
  else if (p.includes('صيانة') || p.includes('صيانه') || p.includes('تصليح') || p.includes('تكييف') || p.includes('ثلاجة')) {
    const acc = findAccByCode('623') || findAccByKeyword('صيانة');
    debitAccountId = acc?.id;
    debitAccountName = acc?.name_ar || 'صيانة تجهيزات وثلاجات الأدوية والمكيفات';
    narration = `مصروفات صيانة وإصلاحات دورية لمقر الصيدلية`;
    recognizedRule = 'صيانة دورية وتجهيزات';
  }
  // 4. Employee Advances / Loans (سلفة موظف / صيدلي)
  else if (p.includes('سلفة') || p.includes('سلفه') || p.includes('سلف')) {
    const acc = findAccByCode('11601') || findAccByKeyword('سلف');
    debitAccountId = acc?.id;
    debitAccountName = acc?.name_ar || 'سلف العاملين المؤقتة والمستديمة';
    narration = `صرف سلفة نقدية مستعجلة من عهدة ${creditAccountName}`;
    recognizedRule = 'أصول متداولة (سلف موظفين)';
  }
  // 5. Pharma Distributors (المتحدة، ابن سينا، فارما أوفرسيز، رامكو)
  else if (p.includes('متحدة') || p.includes('متحده') || p.includes('ابن سينا') || p.includes('أوفرسيز') || p.includes('اوفرسيز') || p.includes('رامكو') || p.includes('مورد') || p.includes('توزيع أدوية')) {
    // Check if Payment or Purchase Invoice or Expired Return
    if (p.includes('سداد') || p.includes('دفعة') || p.includes('دفعه') || p.includes('شيك') || p.includes('دفعنا')) {
      const acc = findAccByCode('21101') || findAccByCode('211');
      debitAccountId = acc?.id;
      debitAccountName = acc?.name_ar || 'موردي وشركات توزيع الأدوية';
      narration = `سداد دفعة تحت الحساب لشركة توزيع الأدوية`;
      recognizedRule = 'سداد التزامات موردي الأدوية';
    } else if (p.includes('مرتجع') || p.includes('إكسباير') || p.includes('اكسباير') || p.includes('خصم')) {
      // Credit note from vendor: Debit Vendor, Credit Expired/COGS
      const acc = findAccByCode('21101') || findAccByCode('211');
      debitAccountId = acc?.id;
      debitAccountName = acc?.name_ar || 'موردي وشركات توزيع الأدوية';
      const cogsAcc = findAccByCode('59') || findAccByCode('11501');
      creditAccountId = cogsAcc?.id;
      creditAccountName = cogsAcc?.name_ar || 'تسويات عجز وتوالف وإكسباير الأدوية';
      narration = `إشعار خصم مرتجع أدوية منتهية الصلاحية (إكسباير) معتمد من الموزع`;
      recognizedRule = 'إشعار خصم مرتجع إكسباير للموزع';
    } else {
      // Purchase invoice: Debit Medicines Inventory, Credit Vendor
      const invAcc = findAccByCode('11501') || findAccByCode('115');
      debitAccountId = invAcc?.id;
      debitAccountName = invAcc?.name_ar || 'مخزون الأدوية البشرية';
      const vndAcc = findAccByCode('21101') || findAccByCode('211');
      creditAccountId = vndAcc?.id;
      creditAccountName = vndAcc?.name_ar || 'موردي وشركات توزيع الأدوية';
      narration = `إثبات فاتورة توريد أدوية ومحاليل علاجية آجل`;
      recognizedRule = 'فاتورة مشتريات أدوية واردة';
    }
  }
  // 6. Transfer between Treasuries & Banks
  else if (p.includes('تحويل') || p.includes('ايداع') || p.includes('إيداع') || p.includes('سحب')) {
    const toBankAcc = findAccByCode('11201') || findAccByCode('112');
    debitAccountId = toBankAcc?.id;
    debitAccountName = toBankAcc?.name_ar || 'البنك الأهلي المصري';
    narration = `تحويل نقدية وتوريد للبنك من ${creditAccountName}`;
    recognizedRule = 'تحويل وإيداع نقدية بين الحسابات';
  }
  // 7. General Pharmacy Supplies & Hospitality (نظافة / أدوات مكتبية / ضيافة)
  else if (p.includes('نظافة') || p.includes('نضافه') || p.includes('أكياس') || p.includes('مطبوعات') || p.includes('ضيافة') || p.includes('شاي') || p.includes('بوفيه')) {
    const acc = findAccByCode('625') || findAccByCode('62') || findAccByCode('6');
    debitAccountId = acc?.id;
    debitAccountName = acc?.name_ar || 'مهمات نظافة ومطبوعات وأكياس ومصاريف نثرية';
    narration = `شراء مستلزمات نظافة وأكياس ومهمات استهلاكية للصيدلية`;
    recognizedRule = 'مصروفات نثرية واستهلاكية';
  }
  // Fallback General Expense
  else {
    const acc = findAccByCode('629') || findAccByCode('62') || findAccByCode('6');
    debitAccountId = acc?.id;
    debitAccountName = acc?.name_ar || 'مصروفات تشغيلية وإدارية عامة';
    narration = prompt.trim();
    recognizedRule = 'مصروفات تشغيلية عامة متنوعة';
  }

  // Fallback IDs if still missing
  if (!debitAccountId) {
    debitAccountId = accounts.find((a) => !a.is_parent)?.id || 'acc-fallback-debit';
  }
  if (!creditAccountId) {
    creditAccountId = accounts.find((a) => !a.is_parent && a.id !== debitAccountId)?.id || 'acc-fallback-credit';
  }

  const lines = [
    {
      account_id: debitAccountId,
      debit: amount,
      credit: 0,
      cost_center_id: detectedCostCenterId,
      line_desc: `${narration} (الطرف المدين)`
    },
    {
      account_id: creditAccountId,
      debit: 0,
      credit: amount,
      cost_center_id: detectedCostCenterId,
      line_desc: `${narration} (الطرف الدائن)`
    }
  ];

  return {
    success: true,
    suggestedEntry: {
      entry_number: `AI-JV-${Date.now().toString().slice(-6)}`,
      entry_date: new Date().toISOString().slice(0, 10),
      doc_type: transactionCategory === 'expense' ? 'expense' : 'manual',
      branch_id: detectedBranchId,
      narration,
      total_debit: amount,
      total_credit: amount,
      lines,
      is_posted: true,
      ai_generated: true,
    },
    recognizedRule,
    confidence: amount > 0 ? 0.95 : 0.70,
    parsedAmount: amount,
    debitAccountName,
    creditAccountName,
  };
}

/**
 * 3. رادار التدقيق المالي الآلي واكتشاف الشذوذ المحاسبي (AI Audit Radar)
 */
export function auditFinancialHealth(accounts = [], entries = [], treasuries = []) {
  const anomalies = [];
  let healthScore = 100;

  // 1. Check for inverted balances (Cash/Bank with Credit Balance = Overdraft, Revenue with Debit Balance)
  accounts.forEach((acc) => {
    if (acc.is_parent) return;
    const bal = parseFloat(acc.current_balance) || 0;

    // Assets with negative/credit balance
    if (acc.account_type === 'asset' && bal < -1) {
      healthScore -= 10;
      anomalies.push({
        severity: 'high',
        type: 'negative_asset',
        title: `رصيد سالب غير معتاد في حساب: ${acc.name_ar} (${acc.code})`,
        description: `الحساب أصل مدين طبيعته، لكن رصيده الحالي يظهر دائناً بالسالب بقيمة (${bal.toLocaleString()} ج.م). قد يشير إلى سحب على المكشوف أو قيد صرف لم يُسبق بتوريد كاش.`,
        recommendation: 'فحص قيود الصرف والتحويلات أو إثبات تمويل الخزينة من الحساب البنكي.',
        accountId: acc.id,
      });
    }

    // Liabilities with debit balance
    if (acc.account_type === 'liability' && bal < -1) {
      healthScore -= 5;
      anomalies.push({
        severity: 'medium',
        type: 'debit_liability',
        title: `رصيد مدين في حساب التزامات: ${acc.name_ar} (${acc.code})`,
        description: `الرصيد يظهر مديناً بقيمة (${Math.abs(bal).toLocaleString()} ج.م)، مما يعني أن الصيدلية دفعت للمورد أكثر من قيمة الفواتير المستحقة أو وجود إشعار خصم زائد.`,
        recommendation: 'مراجعة كشف حساب المورد ومطابقة الفواتير مع الدفعات المسددة.',
        accountId: acc.id,
      });
    }
  });

  // 2. Check for unbalanced journal entries
  let unbalancedCount = 0;
  entries.forEach((e) => {
    const deb = parseFloat(e.total_debit) || 0;
    const cred = parseFloat(e.total_credit) || 0;
    if (Math.abs(deb - cred) > 0.05) {
      unbalancedCount++;
    }
  });

  if (unbalancedCount > 0) {
    healthScore -= 25;
    anomalies.push({
      severity: 'critical',
      type: 'unbalanced_entries',
      title: `اكتشاف ${unbalancedCount} قيد محاسبي غير متزن باليومية العامة!`,
      description: 'هناك قيود يومية يتفوق فيها الطرف المدين على الدائن أو العكس، مما يخل بميزان المراجعة.',
      recommendation: 'مراجعة أسطر القيود المعنية وتعديلها لتطابق نظرية القيد المزدوج المتوازن.',
    });
  }

  // 3. Check for high POS / Bank Commissions
  const totalFees = accounts
    .filter((a) => a.code && a.code.startsWith('65'))
    .reduce((sum, a) => sum + (parseFloat(a.current_balance) || 0), 0);

  const totalRev = accounts
    .filter((a) => a.account_type === 'revenue' && !a.is_parent)
    .reduce((sum, a) => sum + (parseFloat(a.current_balance) || 0), 0);

  if (totalRev > 0) {
    const feeRatio = (totalFees / totalRev) * 100;
    if (feeRatio > 2.5) {
      anomalies.push({
        severity: 'info',
        type: 'fee_leakage',
        title: `نسبة عمولات الدفع الإلكتروني مرتفعة (${feeRatio.toFixed(2)}% من الإيرادات)`,
        description: `إجمالي العمولات المقتطعة وصل إلى (${totalFees.toLocaleString()} ج.م). تفاوض مع البنك المشغل لماكينات نقاط البيع (POS) لتخفيض الشريحة إلى 1.1% أو تفعيل سحب إنستاباي بدلاً من بطاقات الائتمان.`,
        recommendation: 'توجيه العملاء للتحويل اللحظي بإنستاباي لتقليل كلفة عمولات نقاط البيع.',
      });
    }
  }

  healthScore = Math.max(20, Math.min(100, healthScore));

  return {
    healthScore,
    status: healthScore >= 85 ? 'ممتاز' : healthScore >= 65 ? 'جيد مع بعض الملاحظات' : 'يحتاج لمراجعة وتدقيق فوري',
    anomalies,
    totalAuditedAccounts: accounts.length,
    totalAuditedEntries: entries.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 4. محرك التنبؤ بالتدفقات النقدية لـ 30 يوماً (30-Day Cash Flow Forecast)
 */
export function generateCashFlowForecast(treasuries = [], entries = [], vendorTransactions = [], days = 30) {
  const currentTotalLiquid = treasuries.reduce((sum, t) => sum + (parseFloat(t.current_balance) || 0), 0);

  // Estimate daily sales run rate based on last entries
  const lastSales = entries
    .filter((e) => e.doc_type === 'sale')
    .slice(0, 30);

  let avgDailyInflow = 18500; // default benchmark for pharmacy branch chain
  if (lastSales.length > 0) {
    const sum = lastSales.reduce((s, e) => s + (parseFloat(e.total_debit) || 0), 0);
    avgDailyInflow = sum / Math.max(1, lastSales.length);
  }

  const timeline = [];
  let runningCash = currentTotalLiquid;
  const today = new Date();

  // Map open vendor invoices due dates
  const dueVendorMap = {};
  vendorTransactions.forEach((tx) => {
    if (tx.status === 'open' && tx.due_date && tx.tx_type === 'invoice') {
      dueVendorMap[tx.due_date] = (dueVendorMap[tx.due_date] || 0) + (parseFloat(tx.amount) || 0);
    }
  });

  let minimumProjected = runningCash;
  let minimumDay = '';

  for (let i = 1; i <= days; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + i);
    const dateStr = targetDate.toISOString().slice(0, 10);

    const projectedInflow = avgDailyInflow * (targetDate.getDay() === 5 ? 0.6 : 1.0); // Friday weekend factor
    const vendorPayableDue = dueVendorMap[dateStr] || (i === 15 || i === 30 ? 45000 : 0); // payroll / supplier spikes
    const netChange = projectedInflow - vendorPayableDue;
    runningCash += netChange;

    if (runningCash < minimumProjected) {
      minimumProjected = runningCash;
      minimumDay = dateStr;
    }

    timeline.push({
      day: i,
      date: dateStr,
      dayName: targetDate.toLocaleDateString('ar-EG', { weekday: 'short' }),
      projectedInflow,
      projectedOutflow: vendorPayableDue,
      netChange,
      projectedBalance: runningCash,
    });
  }

  return {
    initialLiquid: currentTotalLiquid,
    finalProjectedLiquid: runningCash,
    minimumProjectedBalance: minimumProjected,
    minimumProjectedDate: minimumDay,
    hasLiquidityRisk: minimumProjected < 50000,
    timeline,
  };
}
