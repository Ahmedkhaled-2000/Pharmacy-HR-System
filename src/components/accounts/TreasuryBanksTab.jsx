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
        <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>إجمالي السيولة النقدية والبنكية</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: '#38bdf8' }}>
            {totalFunds.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: '12px', color: '#64748b' }}>ج.م</span>
          </div>
        </div>

        <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>نقدية الخزائن بالفروع</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: '#34d399' }}>
            {totalCashboxes.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: '12px', color: '#64748b' }}>ج.م</span>
          </div>
        </div>

        <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>أرصدة الحسابات البنكية</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: '#60a5fa' }}>
            {totalBanks.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: '12px', color: '#64748b' }}>ج.م</span>
          </div>
        </div>

        <div style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>أرصدة نقاط البيع وإنستاباي والمحافظ</div>
          <div style={{ fontSize: '22px', fontWeight: '800', color: '#c084fc' }}>
            {totalEGateways.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span style={{ fontSize: '12px', color: '#64748b' }}>ج.م</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: '#fff' }}>
            دليل الخزائن وحسابات الدفع الإلكتروني ({treasuries.length})
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
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
                <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
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
                <span style={{ fontSize: '13px', color: '#94a3b8', marginRight: '6px' }}>ج.م</span>
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
                style={{ padding: '4px 10px', fontSize: '11.5px', borderColor: 'rgba(56, 189, 248, 0.3)', color: '#38bdf8' }}
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
