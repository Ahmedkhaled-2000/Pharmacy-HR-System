import React from 'react';

/**
 * TreasuryBanksTab.jsx
 * شاشة إدارة الخزائن، الحسابات البنكية، أجهزة نقاط البيع، المحافظ الإلكترونية، وإنستاباي
 * مع تمكين التعديل الفوري لنسب الخصم والعمولات وإجراء التحويلات البينية
 */
export default function TreasuryBanksTab({
  treasuries = [],
  branches = [],
  onOpenEditFee,
  onOpenTransferWithTreasury,
  onAddNewTreasury,
}) {
  const getBranchName = (branchId) => {
    if (!branchId) return 'الإدارة العامة / بدون فرع محدد';
    const found = branches.find((b) => b.id === branchId);
    return found ? found.name : `فرع #${branchId}`;
  };

  const getBadgeClass = (type) => {
    switch (type) {
      case 'cashbox': return 'badge-cashbox';
      case 'bank': return 'badge-bank';
      case 'pos': return 'badge-pos';
      case 'instapay': return 'badge-instapay';
      case 'wallet': return 'badge-wallet';
      default: return 'badge-cashbox';
    }
  };

  const getTypeName = (type) => {
    switch (type) {
      case 'cashbox': return 'خزينة نقدية (كاش)';
      case 'bank': return 'حساب مصرفي / بنك';
      case 'pos': return 'نقطة بيع إلكترونية (POS)';
      case 'instapay': return 'شبكة إنستاباي (لحظي)';
      case 'wallet': return 'محفظة ذكية (كاش)';
      default: return type;
    }
  };

  // Compute total liquid funds across all treasuries
  const totalFunds = treasuries.reduce((sum, t) => sum + (parseFloat(t.current_balance) || 0), 0);
  const totalCashboxes = treasuries.filter((t) => t.treasury_type === 'cashbox').reduce((sum, t) => sum + (parseFloat(t.current_balance) || 0), 0);
  const totalBanks = treasuries.filter((t) => t.treasury_type === 'bank').reduce((sum, t) => sum + (parseFloat(t.current_balance) || 0), 0);
  const totalEGateways = treasuries.filter((t) => ['pos', 'instapay', 'wallet'].includes(t.treasury_type)).reduce((sum, t) => sum + (parseFloat(t.current_balance) || 0), 0);

  return (
    <div>
      {/* Overview Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '22px',
        }}
      >
        <div style={{ background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)', borderTop: '3.5px solid #0284c7', borderRadius: '16px', padding: '16px 20px', boxShadow: 'var(--acc-shadow-sm)' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted, #64748b)', marginBottom: '4px' }}>إجمالي السيولة النقدية والبنكية</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#0284c7' }}>
            {totalFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)' }}>ج.م</span>
          </div>
        </div>

        <div style={{ background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)', borderTop: '3.5px solid #0d9488', borderRadius: '16px', padding: '16px 20px', boxShadow: 'var(--acc-shadow-sm)' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted, #64748b)', marginBottom: '4px' }}>نقدية الخزائن بالفروع</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#0d9488' }}>
            {totalCashboxes.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)' }}>ج.م</span>
          </div>
        </div>

        <div style={{ background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)', borderTop: '3.5px solid #2563eb', borderRadius: '16px', padding: '16px 20px', boxShadow: 'var(--acc-shadow-sm)' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted, #64748b)', marginBottom: '4px' }}>أرصدة الحسابات البنكية</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#2563eb' }}>
            {totalBanks.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)' }}>ج.م</span>
          </div>
        </div>

        <div style={{ background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)', borderTop: '3.5px solid #7c3aed', borderRadius: '16px', padding: '16px 20px', boxShadow: 'var(--acc-shadow-sm)' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted, #64748b)', marginBottom: '4px' }}>أرصدة نقاط البيع وإنستاباي والمحافظ</div>
          <div style={{ fontSize: '24px', fontWeight: '900', color: '#7c3aed' }}>
            {totalEGateways.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: '12px', color: 'var(--muted, #64748b)' }}>ج.م</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: 'var(--text, #0f172a)' }}>
            دليل الخزائن وحسابات الدفع الإلكتروني ({treasuries.length})
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--muted, #64748b)' }}>
            اضغط على زر "تعديل نسبة الخصم" لتغيير عمولة البنك أو المحفظة أو إنستاباي في أي وقت
          </p>
        </div>

        <button
          type="button"
          className="acc-btn acc-btn-primary"
          onClick={onAddNewTreasury}
        >
          ➕ إضافة خزينة / حساب بنكي جديد
        </button>
      </div>

      {/* Grid of Cards */}
      <div className="acc-treasury-grid">
        {treasuries.map((treasury) => (
          <div key={treasury.id} className="acc-treasury-card">
            {/* Header */}
            <div className="acc-treasury-header">
              <div className="acc-treasury-info">
                <span className="acc-treasury-code">{treasury.code}</span>
                <h3>{treasury.name}</h3>
                <div style={{ fontSize: '11.5px', color: 'var(--muted, #64748b)', marginTop: '2px' }}>
                  🏢 {getBranchName(treasury.branch_id)}
                </div>
              </div>
              <span className={`acc-treasury-type-badge ${getBadgeClass(treasury.treasury_type)}`}>
                {getTypeName(treasury.treasury_type)}
              </span>
            </div>

            {/* Balance Box */}
            <div className="acc-treasury-balance-box">
              <div className="acc-treasury-balance-lbl">الرصيد الفعلي المتوفر:</div>
              <div className="acc-treasury-balance-val">
                {Number(treasury.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                <span style={{ fontSize: '13px', color: 'var(--muted, #64748b)', marginRight: '6px' }}>ج.م</span>
              </div>
            </div>

            {/* Fee Info Badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="acc-fee-pill">
                <span>📉</span>
                <span>
                  نسبة الخصم / العمولة: <strong>{treasury.fee_percentage || 0}%</strong>
                  {treasury.fee_fixed > 0 && ` + ${treasury.fee_fixed} ج.م`}
                </span>
              </span>

              <button
                type="button"
                className="acc-btn acc-btn-outline"
                onClick={() => onOpenEditFee(treasury)}
                style={{ padding: '4px 10px', fontSize: '11.5px', borderColor: '#0284c7', color: '#0284c7', background: '#f0f9ff' }}
                title="تعديل نسبة خصم وعمولة البنك أو المحفظة"
              >
                ⚙️ تعديل النسبة
              </button>
            </div>

            {/* Actions */}
            <div className="acc-treasury-actions">
              <button
                type="button"
                className="acc-btn acc-btn-outline"
                onClick={() => onOpenTransferWithTreasury(treasury)}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                🔄 تحويل نقدية
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
