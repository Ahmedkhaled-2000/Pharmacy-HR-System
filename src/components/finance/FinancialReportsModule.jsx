import React, { useState, useMemo } from 'react';
import {
  computeComprehensiveFinancialReport,
  exportComprehensiveFinancialToExcel
} from '../../utils/financialReportsEngine';
import { triggerDirectPrint } from '../../utils/printHelper';

/**
 * FinancialReportsModule.jsx
 * شاشة التقارير المالية وصافي الأرباح الشاملة لمجموعة الصيدليات (مقتصرة حصرياً على الإدارة العليا والمالك)
 */
export default function FinancialReportsModule({
  state,
  setState,
  saveState,
  showToast,
  monthPicker: propMonthPicker,
  setMonthPicker: propSetMonthPicker,
  filterMode: propFilterMode,
  setFilterMode: propSetFilterMode,
  customFrom: propCustomFrom,
  setCustomFrom: propSetCustomFrom,
  customTo: propCustomTo,
  setCustomTo: propSetCustomTo
}) {
  // ── Filters State ──
  const [filterBranchId, setFilterBranchId] = useState('all');
  const [periodMode, setPeriodMode] = useState('month'); // 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'quarter' | 'year' | 'custom'
  const [selectedMonth, setSelectedMonth] = useState(() => propMonthPicker || new Date().toISOString().slice(0, 7));
  const [customFrom, setCustomFrom] = useState(() => propCustomFrom || '');
  const [customTo, setCustomTo] = useState(() => propCustomTo || '');

  // ── Sub-view Tabs ──
  // 'pl' (قائمة الدخل) | 'benchmark' (مقارنة الفروع) | 'visual' (التحليل البصري) | 'drilldown' (السجلات المدققة)
  const [activeTab, setActiveTab] = useState('pl');

  // Compute Emp Summary from context/state
  const computeEmpSummary = state?.computeEmpSummary || null;

  // ── Compute Financial Report via Engine ──
  const report = useMemo(() => {
    return computeComprehensiveFinancialReport({
      state,
      filterBranchId,
      periodMode,
      selectedMonth,
      customFrom,
      customTo,
      computeEmpSummary
    });
  }, [state, filterBranchId, periodMode, selectedMonth, customFrom, customTo, computeEmpSummary]);

  const branches = state?.branches || [];

  // ── Handlers: Excel Export ──
  const handleExportExcel = () => {
    exportComprehensiveFinancialToExcel({
      reportData: report,
      showToast
    });
  };

  // ── Handlers: Print Formal A4 P&L Statement ──
  const handlePrintReport = () => {
    const isProfit = report.netProfit > 0 || (report.netProfit === 0 && report.totalGrossRevenues === 0 && report.totalOperatingCosts === 0);
    const printHtml = `
      <div style="direction: rtl; font-family: 'Cairo', 'Tajawal', sans-serif; padding: 25px; color: #0f172a;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5px solid #0f766e; padding-bottom: 12px; margin-bottom: 20px;">
          <div>
            <h1 style="margin: 0; font-size: 20px; color: #0f766e; font-weight: 900;">
              🏥 مجموعة صيدليات د. منار الكومي — الإدارة المالية
            </h1>
            <h2 style="margin: 4px 0 0 0; font-size: 16px; color: #1e293b; font-weight: 800;">
              قائمة الدخل والأرباح والخسائر الرسمية المعتمدة
            </h2>
            <div style="font-size: 13px; color: #64748b; margin-top: 4px;">
              نطاق التقرير: <strong>${report.periodLabel}</strong> | الصيدلية: <strong>${report.singleBranchName}</strong>
            </div>
          </div>
          <div style="text-align: left; background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 14px; borderRadius: 8px; font-size: 12px;">
            <div>تاريخ الإصدار: <strong>${new Date().toLocaleDateString('ar-EG')}</strong></div>
            <div>وقت الطباعة: <strong>${new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</strong></div>
            <div style="color: #0f766e; font-weight: bold; margin-top: 2px;">نسخة سرية معتمدة للإدارة</div>
          </div>
        </div>

        <!-- Executive Numbers Summary Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
          <thead>
            <tr style="background: #0f766e; color: #ffffff;">
              <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: right; width: 45%;">البيان المالي والتشغيلي</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; width: 25%;">القيمة (ج.م)</th>
              <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; width: 30%;">النسبة والملاحظات</th>
            </tr>
          </thead>
          <tbody>
            <!-- Section 1 -->
            <tr style="background: #f1f5f9; font-weight: 900; color: #0f766e;">
              <td colspan="3" style="padding: 8px 10px; border: 1px solid #cbd5e1;">أولاً: إجمالي الإيرادات ومبيعات الفروع (Gross Revenues)</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">  • مبيعات نقدية (كاش)</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${report.totalCashSales.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">${report.totalGrossRevenues > 0 ? ((report.totalCashSales / report.totalGrossRevenues) * 100).toFixed(1) : 0}% من الإيراد</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">  • مبيعات فيزا وبطاقات بنكية</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${report.totalVisaSales.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">${report.totalGrossRevenues > 0 ? ((report.totalVisaSales / report.totalGrossRevenues) * 100).toFixed(1) : 0}% من الإيراد</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">  • مبيعات دليفري وخدمة توصيل</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${report.totalDeliverySales.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">${report.totalGrossRevenues > 0 ? ((report.totalDeliverySales / report.totalGrossRevenues) * 100).toFixed(1) : 0}% من الإيراد</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">  • مبيعات آجل وشركات</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${report.totalCreditSales.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">ذمم مدينة</td>
            </tr>
            ${report.totalOtherIncome > 0 ? `
              <tr>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">  • إيرادات تشغيلية أخرى متفرقة</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${report.totalOtherIncome.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">إيرادات نقدية إضافية</td>
              </tr>
            ` : ''}
            <tr style="background: #ecfdf5; font-weight: 900; font-size: 14px;">
              <td style="padding: 8px 10px; border: 1px solid #cbd5e1; color: #065f46;">صافي مجمل الإيرادات (Total Revenue)</td>
              <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center; color: #0f766e;">${report.totalGrossRevenues.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center; color: #065f46;">100% (أساس الاحتساب)</td>
            </tr>

            <!-- Section 2 -->
            <tr style="background: #f1f5f9; font-weight: 900; color: #1e3a8a;">
              <td colspan="3" style="padding: 8px 10px; border: 1px solid #cbd5e1;">ثانياً: تكاليف الأجور والرواتب ومستحقات الموظفين (Personnel Costs)</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">  • الأجور الأساسية وساعات العمل الفعلية (${report.totalHoursWorked} ساعة)</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${report.totalBaseEarnings.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">استحقاق الساعات التعاقدية</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">  • أجور الساعات الإضافية المعتمدة</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${report.totalOvertimeEarnings.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">إضافي معتمد</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">  • البدلات التعاقدية واليومية</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${report.totalAllowances.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">بدلات إدارة وانتقال وحضور</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">  • المكافآت والحوافز التشغيلية</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: #16a34a;">+${report.totalBonuses.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #15803d;">حوافز إضافية</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">  • الخصومات والجزاءات التأديبية</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: #dc2626;">-${report.totalDeductions.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #b91c1c;">استقطاعات وجزاءات</td>
            </tr>
            <tr style="background: #eff6ff; font-weight: 900; font-size: 13.5px;">
              <td style="padding: 8px 10px; border: 1px solid #cbd5e1; color: #1e40af;">صافي مسير الرواتب والأجور المستحقة (Net Payroll)</td>
              <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center; color: #1e40af;">${report.totalNetPayroll.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center; color: #1e40af;">تمثل ${report.payrollRatio}% من إجمالي المبيعات</td>
            </tr>

            <!-- Section 3 -->
            <tr style="background: #f1f5f9; font-weight: 900; color: #b45309;">
              <td colspan="3" style="padding: 8px 10px; border: 1px solid #cbd5e1;">ثالثاً: المصروفات التشغيلية والنثرية (Operating Expenses)</td>
            </tr>
            ${report.expensesByCategory.map((cat) => `
              <tr>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0;">  • ${cat.category}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-weight: bold;">${cat.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
                <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; color: #64748b;">${cat.percentage}% من المصروفات</td>
              </tr>
            `).join('')}
            <tr style="background: #fffbeb; font-weight: 900; font-size: 13.5px;">
              <td style="padding: 8px 10px; border: 1px solid #cbd5e1; color: #92400e;">إجمالي المصروفات التشغيلية والنثرية</td>
              <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center; color: #b45309;">${report.totalOperatingExpenses.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 8px 10px; border: 1px solid #cbd5e1; text-align: center; color: #92400e;">تمثل ${report.expensesRatio}% من المبيعات</td>
            </tr>

            <!-- Grand Totals & Net Profit -->
            <tr style="background: #f8fafc; font-weight: 900; font-size: 14px;">
              <td style="padding: 9px 10px; border: 1.5px solid #94a3b8; color: #334155;">إجمالي التكاليف والمصروفات المباشرة (Total Costs)</td>
              <td style="padding: 9px 10px; border: 1.5px solid #94a3b8; text-align: center; color: #dc2626;">${report.totalOperatingCosts.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
              <td style="padding: 9px 10px; border: 1.5px solid #94a3b8; text-align: center;">تكاليف الرواتب + المصروفات</td>
            </tr>

            <tr style="background: ${isProfit ? '#dcfce7' : '#fee2e2'}; font-weight: 900; font-size: 16px;">
              <td style="padding: 12px 10px; border: 2px solid ${isProfit ? '#16a34a' : '#dc2626'}; color: ${isProfit ? '#15803d' : '#991b1b'};">
                ${isProfit ? '🏆 صافي الربح التشغيلي الفعلي (Net Profit)' : (report.netProfit < 0 ? '🚨 صافي العجز المالي والتشغيلي (Net Operating Loss)' : '⚖️ نقطة التعادل (Break-even)')}
              </td>
              <td style="padding: 12px 10px; border: 2px solid ${isProfit ? '#16a34a' : '#dc2626'}; text-align: center; color: ${isProfit ? '#15803d' : '#991b1b'}; font-size: 18px;">
                ${report.netProfit.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
              </td>
              <td style="padding: 12px 10px; border: 2px solid ${isProfit ? '#16a34a' : '#dc2626'}; text-align: center; color: ${isProfit ? '#15803d' : '#991b1b'};">
                هامش الربح: <strong>${report.totalGrossRevenues > 0 ? `${report.profitMargin}%` : (report.netProfit < 0 ? '— (عجز بدون مبيعات)' : '0%')}</strong>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Branch Benchmarks Table if all branches -->
        ${!report.isSingleBranch && report.branchBenchmarks.length > 0 ? `
          <h3 style="margin: 20px 0 8px; color: #1e3a8a; font-size: 15px;">📊 ملخص الأداء المالي المقارن بين الصيدليات</h3>
          <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 11.5px; margin-bottom: 24px;">
            <thead>
              <tr style="background: #1e3a8a; color: #ffffff;">
                <th style="padding: 6px; border: 1px solid #cbd5e1;">الترتيب</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">الفرع</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1;">المبيعات (ج.م)</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1;">الرواتب (ج.م)</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1;">المصروفات (ج.م)</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1;">صافي الربح (ج.م)</th>
                <th style="padding: 6px; border: 1px solid #cbd5e1;">هامش الربح %</th>
              </tr>
            </thead>
            <tbody>
              ${report.branchBenchmarks.map((b, i) => `
                <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td style="padding: 5px; border: 1px solid #cbd5e1; font-weight: bold;">${i + 1}</td>
                  <td style="padding: 5px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${b.branchName}</td>
                  <td style="padding: 5px; border: 1px solid #cbd5e1;">${b.grossRevenue.toLocaleString('ar-EG')}</td>
                  <td style="padding: 5px; border: 1px solid #cbd5e1;">${b.payroll.toLocaleString('ar-EG')}</td>
                  <td style="padding: 5px; border: 1px solid #cbd5e1;">${b.operatingExpenses.toLocaleString('ar-EG')}</td>
                  <td style="padding: 5px; border: 1px solid #cbd5e1; font-weight: bold; color: ${b.netProfit >= 0 ? '#15803d' : '#dc2626'};">${b.netProfit.toLocaleString('ar-EG')}</td>
                  <td style="padding: 5px; border: 1px solid #cbd5e1; font-weight: bold;">${b.profitMargin}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        <!-- Signatures Footer -->
        <div style="display: flex; justify-content: space-between; margin-top: 36px; padding-top: 14px; border-top: 1.5px solid #cbd5e1; font-size: 13px;">
          <div style="text-align: center; width: 30%;">
            <div>المحاسب المالي / إعداد</div>
            <div style="margin-top: 35px; border-bottom: 1px dashed #94a3b8; width: 80%; margin-right: auto; margin-left: auto;"></div>
          </div>
          <div style="text-align: center; width: 30%;">
            <div>المدير المالي / مراجعة</div>
            <div style="margin-top: 35px; border-bottom: 1px dashed #94a3b8; width: 80%; margin-right: auto; margin-left: auto;"></div>
          </div>
          <div style="text-align: center; width: 30%;">
            <div>اعتماد مجلس الإدارة والمالك</div>
            <div style="margin-top: 35px; border-bottom: 1px dashed #94a3b8; width: 80%; margin-right: auto; margin-left: auto;"></div>
          </div>
        </div>
      </div>
    `;

    triggerDirectPrint(printHtml, `تقرير-قائمة-الدخل-والأرباح-${report.periodLabel.replace(/\s+/g, '-')}`);
  };

  const isNetProfitPositive = report.netProfit > 0 || (report.netProfit === 0 && report.totalGrossRevenues === 0 && report.totalOperatingCosts === 0);

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl' }}>
      
      {/* ── 1. Header Banner ── */}
      <div className="card settings-card" style={{
        padding: '22px 26px',
        background: 'linear-gradient(135deg, #065f46 0%, #0f766e 100%)',
        color: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(6, 95, 70, 0.3)',
        border: 'none'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '30px', background: 'rgba(255,255,255,0.2)', padding: '6px 14px', borderRadius: '12px' }}>📊</span>
              <div>
                <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#ffffff', letterSpacing: '0.3px' }}>
                  التقارير المالية وقائمة الدخل والأرباح
                </h1>
                <p style={{ margin: '4px 0 0 0', fontSize: '13.5px', color: 'rgba(255,255,255,0.85)' }}>
                  رصد شامل للمبيعات، مسير الرواتب، المصروفات التشغيلية، المكافآت والخصومات، واحتساب صافي الأرباح
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleExportExcel}
              style={{
                background: '#ffffff',
                color: '#065f46',
                border: 'none',
                fontSize: '13px',
                fontWeight: '900',
                padding: '8px 18px',
                borderRadius: '10px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>📊</span> تصدير Excel رسمي
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handlePrintReport}
              style={{
                background: 'rgba(255,255,255,0.2)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.35)',
                fontSize: '13px',
                fontWeight: '800',
                padding: '8px 18px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🖨️</span> طباعة قائمة الدخل A4
            </button>
          </div>
        </div>

        {/* Security Notice */}
        <div style={{
          marginTop: '14px',
          padding: '8px 14px',
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '8px',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#e2e8f0'
        }}>
          <span>🔒</span>
          <span>
            هذه الشاشة سرية ومخصصة حصرياً <strong>للإدارة العليا والمالك (Admin & Owner)</strong>، ومحجوبة تماماً عن مديري الفروع لضمان أمان وهوامش الأرباح.
          </span>
        </div>
      </div>

      {/* ── 2. Top Executive KPI Summary Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '14px'
      }}>
        {/* KPI 1: Gross Revenues */}
        <div className="card settings-card" style={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '700' }}>إجمالي الإيرادات والمبيعات</span>
            <span style={{ fontSize: '20px', background: '#ecfdf5', padding: '6px', borderRadius: '10px' }}>💰</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#0f766e', marginTop: '6px' }}>
            {report.totalGrossRevenues.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} <span style={{ fontSize: '12.5px', fontWeight: 'normal' }}>ج.م</span>
          </div>
          <div style={{ fontSize: '11.5px', marginTop: '6px', color: 'var(--muted)' }}>
            كاش: <strong>{report.totalCashSales.toLocaleString('ar-EG')}</strong> | فيزا: <strong>{report.totalVisaSales.toLocaleString('ar-EG')}</strong>
          </div>
        </div>

        {/* KPI 2: Total Net Payroll */}
        <div className="card settings-card" style={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '700' }}>كلفة الرواتب والأجور</span>
            <span style={{ fontSize: '20px', background: '#eff6ff', padding: '6px', borderRadius: '10px' }}>👥</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#1e40af', marginTop: '6px' }}>
            {report.totalNetPayroll.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} <span style={{ fontSize: '12.5px', fontWeight: 'normal' }}>ج.م</span>
          </div>
          <div style={{ fontSize: '11.5px', marginTop: '6px', color: report.payrollRatio > 25 ? '#dc2626' : '#15803d', fontWeight: '700' }}>
            نسبة الرواتب للمبيعات: {report.payrollRatio}%
          </div>
        </div>

        {/* KPI 3: Operating Expenses */}
        <div className="card settings-card" style={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '700' }}>المصروفات التشغيلية</span>
            <span style={{ fontSize: '20px', background: '#fffbeb', padding: '6px', borderRadius: '10px' }}>🧾</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: '#b45309', marginTop: '6px' }}>
            {report.totalOperatingExpenses.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} <span style={{ fontSize: '12.5px', fontWeight: 'normal' }}>ج.م</span>
          </div>
          <div style={{ fontSize: '11.5px', marginTop: '6px', color: 'var(--muted)' }}>
            إجمالي التكاليف: <strong>{report.totalOperatingCosts.toLocaleString('ar-EG')} ج.م</strong>
          </div>
        </div>

        {/* KPI 4: Net Profit (Crown Card) */}
        <div className="card settings-card" style={{
          padding: '16px 20px',
          borderRadius: '14px',
          border: `1.5px solid ${isNetProfitPositive ? '#86efac' : '#fca5a5'}`,
          background: isNetProfitPositive ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : 'linear-gradient(135deg, #fef2f2, #fee2e2)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', color: isNetProfitPositive ? '#166534' : (report.netProfit < 0 ? '#991b1b' : '#334155'), fontWeight: '800' }}>
              {isNetProfitPositive ? '💎 صافي الربح الفعلي' : (report.netProfit < 0 ? '🚨 صافي العجز المالي (خسارة)' : '⚖️ نقطة التعادل')}
            </span>
            <span style={{ fontSize: '20px' }}>{isNetProfitPositive ? '🏆' : (report.netProfit < 0 ? '🚨' : '⚖️')}</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: isNetProfitPositive ? '#15803d' : (report.netProfit < 0 ? '#b91c1c' : '#334155'), marginTop: '6px' }}>
            {report.netProfit.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} <span style={{ fontSize: '13px' }}>ج.م</span>
          </div>
          <div style={{ fontSize: '12px', marginTop: '6px', color: isNetProfitPositive ? '#166534' : (report.netProfit < 0 ? '#991b1b' : 'var(--muted)'), fontWeight: '800' }}>
            هامش الربح الصافي: {report.totalGrossRevenues > 0 ? `${report.profitMargin}%` : (report.netProfit < 0 ? '— (عجز بدون مبيعات)' : '0%')}
          </div>
        </div>
      </div>

      {/* ── 3. Health & Audit Alerts (If any) ── */}
      {report.healthAlerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {report.healthAlerts.map((alert, idx) => (
            <div
              key={idx}
              style={{
                padding: '10px 16px',
                borderRadius: '10px',
                border: alert.type === 'danger' ? '1px solid #fca5a5' : (alert.type === 'warning' ? '1px solid #fde047' : '1px solid #86efac'),
                background: alert.type === 'danger' ? '#fef2f2' : (alert.type === 'warning' ? '#fefce8' : '#f0fdf4'),
                color: alert.type === 'danger' ? '#991b1b' : (alert.type === 'warning' ? '#854d0e' : '#166534'),
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <span style={{ fontSize: '18px' }}>{alert.type === 'danger' ? '🚨' : (alert.type === 'warning' ? '⚠️' : '✅')}</span>
              <div>
                <strong>{alert.title}: </strong>
                <span>{alert.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 4. Advanced Filter Toolbar ── */}
      <div className="card settings-card" style={{ padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          
          {/* View Mode Tabs */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('pl')}
              style={{
                border: 'none',
                background: activeTab === 'pl' ? '#ffffff' : 'transparent',
                color: activeTab === 'pl' ? '#0f766e' : '#475569',
                fontWeight: activeTab === 'pl' ? '900' : '700',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: activeTab === 'pl' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>📑</span> قائمة الدخل (P&L)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('benchmark')}
              style={{
                border: 'none',
                background: activeTab === 'benchmark' ? '#ffffff' : 'transparent',
                color: activeTab === 'benchmark' ? '#0f766e' : '#475569',
                fontWeight: activeTab === 'benchmark' ? '900' : '700',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: activeTab === 'benchmark' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🏢</span> المقارنة المالية بين الفروع
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('visual')}
              style={{
                border: 'none',
                background: activeTab === 'visual' ? '#ffffff' : 'transparent',
                color: activeTab === 'visual' ? '#0f766e' : '#475569',
                fontWeight: activeTab === 'visual' ? '900' : '700',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: activeTab === 'visual' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🥧</span> التحليل وتوزيع التكاليف
            </button>
          </div>

          {/* Current Period Label Badge */}
          <div style={{ fontSize: '13px', fontWeight: '800', color: '#0f766e', background: '#ecfdf5', padding: '6px 14px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
            📅 {report.periodLabel} — {report.singleBranchName}
          </div>
        </div>

        {/* Filter Controls Row */}
        <div style={{
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Branch Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--muted)' }}>🏢 الصيدلية:</label>
            <select
              value={filterBranchId}
              onChange={(e) => setFilterBranchId(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', fontWeight: '700' }}
            >
              <option value="all">كافة الفروع ({branches.length})</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name || b.branchName || `فرع ${b.id}`}</option>
              ))}
            </select>
          </div>

          {/* Period Mode Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: '700', color: 'var(--muted)' }}>⏳ الفترة:</label>
            <select
              value={periodMode}
              onChange={(e) => setPeriodMode(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', fontWeight: '700' }}
            >
              <option value="month">📅 شهر محدد</option>
              <option value="today">اليوم</option>
              <option value="yesterday">أمس</option>
              <option value="week">آخر 7 أيام</option>
              <option value="last_month">الشهر السابق</option>
              <option value="quarter">الربع السنوي الحالي (Q)</option>
              <option value="year">من بداية العام (YTD)</option>
              <option value="custom">📆 نطاق مخصص (من - إلى)</option>
            </select>
          </div>

          {/* Month Input (if month mode) */}
          {periodMode === 'month' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', fontWeight: '700' }}
              />
            </div>
          )}

          {/* Custom Date Inputs (if custom mode) */}
          {periodMode === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              />
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>إلى</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── TAB 1: P&L INCOME STATEMENT ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'pl' && (
        <div className="card settings-card" style={{ padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '900', color: '#1e293b' }}>
                📑 قائمة الدخل والأرباح والخسائر التنفيذية (Income Statement - P&L)
              </h3>
              <p style={{ margin: '3px 0 0 0', color: 'var(--muted)', fontSize: '12.5px' }}>
                تحليل تفصيلي للإيرادات، كلفة الأجور والتشغيل، واحتساب صافي الربح الفعلي
              </p>
            </div>
          </div>

          <div className="table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
            <table className="bylaws-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
              <thead>
                <tr style={{ background: '#0f766e', color: '#ffffff' }}>
                  <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', width: '45%' }}>البيان المحاسبي</th>
                  <th style={{ padding: '12px', fontSize: '13px', width: '25%' }}>القيمة الجزئية (ج.م)</th>
                  <th style={{ padding: '12px', fontSize: '13px', width: '30%' }}>القيمة الإجمالية (ج.م)</th>
                </tr>
              </thead>
              <tbody>
                {/* ── SECTION 1: REVENUES ── */}
                <tr style={{ background: '#f8fafc', fontWeight: '900', color: '#0f766e' }}>
                  <td colSpan="3" style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13.5px', borderBottom: '1px solid #cbd5e1' }}>
                    1. إجمالي الإيرادات ومبيعات الفروع (Gross Revenues)
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '13px' }}>💵 مبيعات نقدية (كاش)</td>
                  <td style={{ padding: '8px', color: '#16a34a', fontWeight: '700' }}>
                    {report.totalCashSales.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '8px', color: 'var(--muted)' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '13px' }}>💳 مبيعات فيزا وبطاقات بنكية</td>
                  <td style={{ padding: '8px', color: '#1d4ed8', fontWeight: '700' }}>
                    {report.totalVisaSales.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '8px', color: 'var(--muted)' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '13px' }}>🛵 مبيعات دليفري وتوصيل</td>
                  <td style={{ padding: '8px', color: '#b45309', fontWeight: '700' }}>
                    {report.totalDeliverySales.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '8px', color: 'var(--muted)' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '13px' }}>📑 مبيعات آجل وشركات</td>
                  <td style={{ padding: '8px', color: '#64748b', fontWeight: '700' }}>
                    {report.totalCreditSales.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '8px', color: 'var(--muted)' }}>—</td>
                </tr>
                {report.totalOtherIncome > 0 && (
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '13px' }}>➕ إيرادات تشغيلية أخرى متفرقة</td>
                    <td style={{ padding: '8px', color: '#0369a1', fontWeight: '700' }}>
                      {report.totalOtherIncome.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '8px', color: 'var(--muted)' }}>—</td>
                  </tr>
                )}
                <tr style={{ background: '#ecfdf5', fontWeight: '900', borderBottom: '2px solid #a7f3d0' }}>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: '#065f46', fontSize: '14px' }}>
                    صافي مجمل الإيرادات (Total Revenues)
                  </td>
                  <td style={{ padding: '10px', color: '#065f46' }}>—</td>
                  <td style={{ padding: '10px', color: '#0f766e', fontSize: '16px' }}>
                    {report.totalGrossRevenues.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                  </td>
                </tr>

                {/* ── SECTION 2: PAYROLL & DIRECT STAFF COSTS ── */}
                <tr style={{ background: '#f8fafc', fontWeight: '900', color: '#1e40af' }}>
                  <td colSpan="3" style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13.5px', borderBottom: '1px solid #cbd5e1' }}>
                    2. كلفة الأجور ومسير رواتب الموظفين (Personnel & Payroll)
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '13px' }}>
                    الأجور الأساسية وساعات العمل ({report.totalHoursWorked} ساعة)
                  </td>
                  <td style={{ padding: '8px', fontWeight: '700' }}>
                    {report.totalBaseEarnings.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '8px', color: 'var(--muted)' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '13px' }}>أجور الساعات الإضافية المعتمدة</td>
                  <td style={{ padding: '8px', fontWeight: '700' }}>
                    {report.totalOvertimeEarnings.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '8px', color: 'var(--muted)' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '13px' }}>البدلات التعاقدية الثابتة واليومية</td>
                  <td style={{ padding: '8px', fontWeight: '700' }}>
                    {report.totalAllowances.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '8px', color: 'var(--muted)' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '13px' }}>المكافآت والحوافز التشغيلية</td>
                  <td style={{ padding: '8px', color: '#16a34a', fontWeight: '700' }}>
                    +{report.totalBonuses.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '8px', color: 'var(--muted)' }}>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '13px' }}>الخصومات والجزاءات التأديبية</td>
                  <td style={{ padding: '8px', color: '#dc2626', fontWeight: '700' }}>
                    -{report.totalDeductions.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '8px', color: 'var(--muted)' }}>—</td>
                </tr>
                <tr style={{ background: '#eff6ff', fontWeight: '900', borderBottom: '2px solid #bfdbfe' }}>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: '#1e40af', fontSize: '14px' }}>
                    صافي مسير الرواتب المستحقة (Net Payroll)
                  </td>
                  <td style={{ padding: '10px', color: '#1e40af' }}>—</td>
                  <td style={{ padding: '10px', color: '#1e40af', fontSize: '16px' }}>
                    {report.totalNetPayroll.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                  </td>
                </tr>

                {/* ── SECTION 3: OPERATING EXPENSES ── */}
                <tr style={{ background: '#f8fafc', fontWeight: '900', color: '#b45309' }}>
                  <td colSpan="3" style={{ padding: '10px 14px', textAlign: 'right', fontSize: '13.5px', borderBottom: '1px solid #cbd5e1' }}>
                    3. المصروفات التشغيلية والنثرية (Operating Expenses)
                  </td>
                </tr>
                {report.expensesByCategory.length === 0 ? (
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 16px', textAlign: 'right', color: 'var(--muted)' }}>لا توجد مصروفات مسجلة لهذه الفترة</td>
                    <td style={{ padding: '8px', color: 'var(--muted)' }}>0.00</td>
                    <td style={{ padding: '8px', color: 'var(--muted)' }}>—</td>
                  </tr>
                ) : (
                  report.expensesByCategory.map((cat, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 16px', textAlign: 'right', fontSize: '13px' }}>
                        • {cat.category} ({cat.percentage}%)
                      </td>
                      <td style={{ padding: '8px', fontWeight: '700' }}>
                        {cat.amount.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '8px', color: 'var(--muted)' }}>—</td>
                    </tr>
                  ))
                )}
                <tr style={{ background: '#fffbeb', fontWeight: '900', borderBottom: '2px solid #fde68a' }}>
                  <td style={{ padding: '10px 16px', textAlign: 'right', color: '#92400e', fontSize: '14px' }}>
                    إجمالي المصروفات التشغيلية
                  </td>
                  <td style={{ padding: '10px', color: '#92400e' }}>—</td>
                  <td style={{ padding: '10px', color: '#b45309', fontSize: '16px' }}>
                    {report.totalOperatingExpenses.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                  </td>
                </tr>

                {/* ── GRAND TOTAL COSTS & NET PROFIT ── */}
                <tr style={{ background: '#f8fafc', fontWeight: '900', borderBottom: '2px solid #94a3b8' }}>
                  <td style={{ padding: '12px 16px', textAlign: 'right', color: '#334155', fontSize: '14.5px' }}>
                    إجمالي التكاليف والمصروفات المباشرة (Total Costs)
                  </td>
                  <td style={{ padding: '12px', color: '#64748b' }}>—</td>
                  <td style={{ padding: '12px', color: '#dc2626', fontSize: '16px' }}>
                    {report.totalOperatingCosts.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                  </td>
                </tr>

                <tr style={{
                  background: isNetProfitPositive ? '#dcfce7' : (report.netProfit < 0 ? '#fee2e2' : '#f8fafc'),
                  fontWeight: '900'
                }}>
                  <td style={{ padding: '16px', textAlign: 'right', color: isNetProfitPositive ? '#166534' : (report.netProfit < 0 ? '#991b1b' : '#334155'), fontSize: '16px' }}>
                    {isNetProfitPositive
                      ? '🏆 صافي الربح الفعلي (Net Operating Profit)'
                      : (report.netProfit < 0 ? '🚨 صافي العجز المالي والتشغيلي (Net Operating Loss)' : '⚖️ نقطة التعادل (Break-even)')}
                  </td>
                  <td style={{ padding: '16px', color: isNetProfitPositive ? '#166534' : (report.netProfit < 0 ? '#991b1b' : 'var(--muted)'), fontSize: '14px' }}>
                    هامش الربح: {report.totalGrossRevenues > 0 ? `${report.profitMargin}%` : (report.netProfit < 0 ? '— (عجز بدون مبيعات)' : '0%')}
                  </td>
                  <td style={{ padding: '16px', color: isNetProfitPositive ? '#15803d' : (report.netProfit < 0 ? '#b91c1c' : '#334155'), fontSize: '20px' }}>
                    {report.netProfit.toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── TAB 2: BRANCH PERFORMANCE BENCHMARK ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'benchmark' && (
        <div className="card settings-card" style={{ padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '900', color: '#1e293b' }}>
                🏢 المقارنة المالية والأرباح المعيارية بين الفروع (Branch Benchmark)
              </h3>
              <p style={{ margin: '3px 0 0 0', color: 'var(--muted)', fontSize: '12.5px' }}>
                مقارنة مبيعات كل صيدلية، كلفة رواتبها، مصروفاتها، وصافي ربحها وهوامش الربحية
              </p>
            </div>
          </div>

          <div className="table-responsive" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <table className="bylaws-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
              <thead>
                <tr style={{ background: '#0f766e', color: '#ffffff', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>الترتيب</th>
                  <th style={{ padding: '10px 12px', fontSize: '12.5px', textAlign: 'right' }}>الفرع</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>إجمالي المبيعات</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>مسير الرواتب</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>المصروفات</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>إجمالي التكاليف</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px', background: '#115e59' }}>صافي الربح (ج.م)</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>هامش الربح</th>
                  <th style={{ padding: '10px 8px', fontSize: '12.5px' }}>التقييم</th>
                </tr>
              </thead>
              <tbody>
                {report.branchBenchmarks.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>
                      لا توجد بيانات فروع مسجلة.
                    </td>
                  </tr>
                ) : (
                  report.branchBenchmarks.map((b, idx) => {
                    const isProfit = b.netProfit >= 0;
                    return (
                      <tr key={b.branchId} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '800', fontSize: '13px' }}>
                          🏢 {b.branchName}
                          {b.branchCode && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', fontWeight: 'normal' }}>كود: {b.branchCode}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: '700', color: '#0f766e' }}>
                          {b.grossRevenue.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#1e40af', fontWeight: '700' }}>
                          {b.payroll.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#b45309', fontWeight: '700' }}>
                          {b.operatingExpenses.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 8px', color: '#dc2626', fontWeight: '700' }}>
                          {b.totalCosts.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{
                          padding: '10px 8px',
                          fontWeight: '900',
                          fontSize: '14px',
                          color: isProfit ? '#15803d' : '#b91c1c',
                          background: isProfit ? '#f0fdf4' : '#fef2f2'
                        }}>
                          {b.netProfit.toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: '800', color: isProfit ? '#166534' : '#991b1b' }}>
                          {b.profitMargin}%
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: '800',
                            background: b.status === 'healthy' ? '#dcfce7' : (b.status === 'moderate' ? '#fef3c7' : '#fee2e2'),
                            color: b.status === 'healthy' ? '#15803d' : (b.status === 'moderate' ? '#b45309' : '#b91c1c')
                          }}>
                            {b.status === 'healthy' ? 'ممتاز 🟢' : (b.status === 'moderate' ? 'متوازن 🟡' : 'عجز 🔴')}
                          </span>
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

      {/* ───────────────────────────────────────────────────────────── */}
      {/* ── TAB 3: VISUAL COST BREAKDOWN & CHARTS ── */}
      {/* ───────────────────────────────────────────────────────────── */}
      {activeTab === 'visual' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          
          {/* Visual 1: Payment Method Share */}
          <div className="card settings-card" style={{ padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
            <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>
              💳 توزيع المبيعات حسب وسيلة الدفع
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { label: '💵 كاش نقدي', amount: report.totalCashSales, color: '#16a34a' },
                { label: '💳 فيزا وبطاقات بنكية', amount: report.totalVisaSales, color: '#1d4ed8' },
                { label: '🛵 مبيعات دليفري', amount: report.totalDeliverySales, color: '#d97706' },
                { label: '📑 آجل وشركات', amount: report.totalCreditSales, color: '#64748b' }
              ].map((item, idx) => {
                const pct = report.totalBranchSales > 0 ? ((item.amount / report.totalBranchSales) * 100).toFixed(1) : 0;
                return (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px', fontWeight: '700' }}>
                      <span>{item.label}</span>
                      <span>{item.amount.toLocaleString('ar-EG')} ج.م ({pct}%)</span>
                    </div>
                    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: item.color, borderRadius: '6px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Visual 2: Overall Outflow Breakdown */}
          <div className="card settings-card" style={{ padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0', background: '#ffffff' }}>
            <h4 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: '800', color: '#1e293b' }}>
              💸 أين تتجه نفقات وتكاليف المؤسسة؟
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px', fontWeight: '700' }}>
                  <span>👥 مسير الرواتب والأجور</span>
                  <span style={{ color: '#1e40af' }}>
                    {report.totalNetPayroll.toLocaleString('ar-EG')} ج.م ({report.totalOperatingCosts > 0 ? ((report.totalNetPayroll / report.totalOperatingCosts) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
                <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${report.totalOperatingCosts > 0 ? ((report.totalNetPayroll / report.totalOperatingCosts) * 100) : 0}%`,
                    height: '100%',
                    background: '#2563eb',
                    borderRadius: '6px'
                  }} />
                </div>
              </div>

              {report.expensesByCategory.slice(0, 4).map((cat, idx) => {
                const pct = report.totalOperatingCosts > 0 ? ((cat.amount / report.totalOperatingCosts) * 100).toFixed(1) : 0;
                return (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px', fontWeight: '700' }}>
                      <span>🧾 {cat.category}</span>
                      <span>{cat.amount.toLocaleString('ar-EG')} ج.م ({pct}%)</span>
                    </div>
                    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#d97706', borderRadius: '6px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
