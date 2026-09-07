import React, { useState, useMemo } from 'react';
import { auditFinancialHealth, generateCashFlowForecast } from '../../utils/aiAccountingEngine';

/**
 * AiAuditRadarModal.jsx
 * نافذة رادار التدقيق المالي وكشف الشذوذ المحاسبي والتنبؤ بالسيولة النقدية لـ 30 يوماً
 */
export default function AiAuditRadarModal({
  isOpen,
  onClose,
  accounts = [],
  entries = [],
  treasuries = [],
  vendorTransactions = [],
}) {
  const [activeTab, setActiveTab] = useState('audit'); // 'audit' | 'forecast'

  const auditReport = useMemo(() => {
    return auditFinancialHealth(accounts, entries, treasuries);
  }, [accounts, entries, treasuries]);

  const cashForecast = useMemo(() => {
    return generateCashFlowForecast(treasuries, entries, vendorTransactions, 30);
  }, [treasuries, entries, vendorTransactions]);

  if (!isOpen) return null;

  return (
    <div className="acc-modal-overlay" onClick={onClose}>
      <div className="acc-modal acc-modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        {/* Header */}
        <div className="acc-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>🛡️</span>
            <div>
              <h2>رادار التدقيق المالي والتنبؤ بالسيولة (AI Financial Radar)</h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                فحص آلي للأرصدة المعكوسة، نزيف العمولات البنكية، ومحاكاة السيولة النقدية لـ 30 يوماً قادمة
              </p>
            </div>
          </div>
          <button type="button" className="acc-action-icon-btn" onClick={onClose} style={{ fontSize: '18px' }}>
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ padding: '0 24px', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', gap: '12px', background: 'var(--surface-subtle, #f8fafc)' }}>
          <button
            type="button"
            className={`acc-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
            style={{ padding: '12px 18px', fontSize: '13.5px' }}
          >
            <span>🛡️ تقرير التدقيق وكشف الشذوذ ({auditReport.anomalies.length})</span>
          </button>
          <button
            type="button"
            className={`acc-tab-btn ${activeTab === 'forecast' ? 'active' : ''}`}
            onClick={() => setActiveTab('forecast')}
            style={{ padding: '12px 18px', fontSize: '13.5px' }}
          >
            <span>📈 التنبؤ بالسيولة النقدية (30 يوماً)</span>
          </button>
        </div>

        {/* Body */}
        <div className="acc-modal-body">
          {/* TAB 1: AUDIT RADAR */}
          {activeTab === 'audit' && (
            <div>
              {/* Score Banner */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderRadius: '12px',
                background: auditReport.healthScore >= 80 ? '#f0fdf4' : '#fffbeb',
                border: `1.5px solid ${auditReport.healthScore >= 80 ? '#86efac' : '#fcd34d'}`,
                marginBottom: '18px',
                flexWrap: 'wrap',
                gap: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '50%',
                    background: auditReport.healthScore >= 80 ? '#166534' : '#b45309',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    fontWeight: '900',
                    fontFamily: 'monospace',
                  }}>
                    {auditReport.healthScore}%
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '16px', color: auditReport.healthScore >= 80 ? '#166534' : '#b45309' }}>
                      مؤشر السلامة والانضباط المحاسبي: {auditReport.status}
                    </h4>
                    <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                      تم فحص {auditReport.totalAuditedAccounts} حساباً في الشجرة و {auditReport.totalAuditedEntries} قيداً باليومية العامة
                    </p>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--muted, #64748b)' }}>
                  فحص لحظي مباشر
                </div>
              </div>

              {/* Anomalies List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {auditReport.anomalies.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '36px', background: 'var(--surface-subtle, #f8fafc)', borderRadius: '12px', border: '1px solid var(--border, #e2e8f0)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
                    <strong style={{ fontSize: '15px', color: '#059669' }}>رائع! لم يتم اكتشاف أي شذوذ محاسبي أو أرصدة سالبة</strong>
                    <p style={{ fontSize: '12.5px', color: 'var(--muted, #64748b)', margin: '4px 0 0' }}>
                      كافة حسابات الخزائن والبنوك والموردين متزنة وتطابق المعايير المحاسبية القياسية.
                    </p>
                  </div>
                ) : (
                  auditReport.anomalies.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: item.severity === 'high' ? '#fef2f2' : item.severity === 'medium' ? '#fffbeb' : '#f0f9ff',
                        border: `1px solid ${item.severity === 'high' ? '#fecaca' : item.severity === 'medium' ? '#fde68a' : '#bae6fd'}`,
                        borderRadius: '12px',
                        padding: '14px 18px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <strong style={{
                          fontSize: '14px',
                          color: item.severity === 'high' ? '#b91c1c' : item.severity === 'medium' ? '#b45309' : '#0369a1',
                        }}>
                          {item.severity === 'high' ? '🚨' : item.severity === 'medium' ? '⚠️' : '💡'} {item.title}
                        </strong>
                        <span style={{
                          fontSize: '11px',
                          background: item.severity === 'high' ? '#fee2e2' : item.severity === 'medium' ? '#fef3c7' : '#e0f2fe',
                          color: item.severity === 'high' ? '#b91c1c' : item.severity === 'medium' ? '#b45309' : '#0284c7',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontWeight: '800',
                        }}>
                          {item.severity === 'high' ? 'أولوية عالية' : item.severity === 'medium' ? 'تنبيه تدقيق' : 'فرصة توفير'}
                        </span>
                      </div>
                      <p style={{ fontSize: '12.5px', color: '#334155', margin: '4px 0 6px', lineHeight: '1.6' }}>
                        {item.description}
                      </p>
                      <div style={{
                        fontSize: '12px',
                        background: '#fff',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px dashed #cbd5e1',
                        color: '#0f766e',
                        fontWeight: '700',
                      }}>
                        💡 التوصية المحاسبية المقترحة: {item.recommendation}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CASH FORECAST */}
          {activeTab === 'forecast' && (
            <div>
              {/* Liquidity High-level Metrics */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginBottom: '16px',
              }}>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)' }}>إجمالي السيولة الحالية المتاحة:</div>
                  <div style={{ fontSize: '18px', fontWeight: '900', color: '#0284c7', fontFamily: 'monospace', marginTop: '2px' }}>
                    {cashForecast.initialLiquid.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)' }}>الرصيد المتوقع بعد 30 يوماً:</div>
                  <div style={{ fontSize: '18px', fontWeight: '900', color: cashForecast.finalProjectedLiquid >= 0 ? '#059669' : '#dc2626', fontFamily: 'monospace', marginTop: '2px' }}>
                    {cashForecast.finalProjectedLiquid.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </div>
                </div>

                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)' }}>أدنى رصيد سيولة متوقع:</div>
                  <div style={{ fontSize: '18px', fontWeight: '900', color: cashForecast.hasLiquidityRisk ? '#dc2626' : '#0d9488', fontFamily: 'monospace', marginTop: '2px' }}>
                    {cashForecast.minimumProjectedBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                  </div>
                  {cashForecast.minimumProjectedDate && (
                    <div style={{ fontSize: '11px', color: 'var(--muted, #64748b)' }}>بتاريخ: {cashForecast.minimumProjectedDate}</div>
                  )}
                </div>
              </div>

              {/* Forecast Alert */}
              {cashForecast.hasLiquidityRisk ? (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 16px', borderRadius: '10px', fontSize: '12.5px', marginBottom: '16px' }}>
                  ⚠️ <strong>تنبيه فجوة سيولة محتملة:</strong> يتوقع النظام انخفاض رصيد السيولة النقدية دون 50,000 ج.م بسبب مواعيد استحقاق شيكات وفواتير شركات الأدوية. يرجى تسريع تحصيل مديونيات التعاقدات والتأمين أو جدولة السداد.
                </div>
              ) : (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '12px 16px', borderRadius: '10px', fontSize: '12.5px', marginBottom: '16px' }}>
                  🟢 <strong>مؤشر أمان السيولة ممتاز:</strong> التدفقات النقدية اليومية المتوقعة من مبيعات الفروع تكفي لتغطية استحقاقات شيكات ومشتريات شركات الأدوية للشهر القادم.
                </div>
              )}

              {/* Sample Projected Timeline Table */}
              <div className="acc-table-card">
                <table className="acc-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '90px' }}>اليوم</th>
                      <th style={{ width: '100px' }}>التاريخ</th>
                      <th style={{ color: '#059669' }}>المبيعات المتوقعة (+)</th>
                      <th style={{ color: '#dc2626' }}>التزامات الموردين (-)</th>
                      <th>صافي التغير</th>
                      <th style={{ color: '#0284c7' }}>الرصيد التراكمي المتوقع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashForecast.timeline.slice(0, 10).map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.dayName} (يوم {row.day})</td>
                        <td>{row.date}</td>
                        <td style={{ color: '#059669', fontFamily: 'monospace' }}>+{row.projectedInflow.toLocaleString()} ج.م</td>
                        <td style={{ color: '#dc2626', fontFamily: 'monospace' }}>
                          {row.projectedOutflow > 0 ? `-${row.projectedOutflow.toLocaleString()} ج.م` : '—'}
                        </td>
                        <td style={{ fontWeight: '700', fontFamily: 'monospace', color: row.netChange >= 0 ? '#059669' : '#dc2626' }}>
                          {row.netChange >= 0 ? '+' : ''}{row.netChange.toLocaleString()}
                        </td>
                        <td style={{ fontWeight: '900', color: '#0284c7', fontFamily: 'monospace' }}>
                          {row.projectedBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="acc-modal-footer">
          <button type="button" className="acc-btn acc-btn-primary" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
