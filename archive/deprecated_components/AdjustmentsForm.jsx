import React from 'react';
import { fmt } from '../../utils/formatters';

export default function AdjustmentsForm({
  state,
  aType,
  setAType,
  aEmpId,
  setAEmpId,
  aDate,
  setADate,
  aAmount,
  setAAmount,
  aDesc,
  setADesc,
  addAdjustment,
  filteredAdjustments,
  getEmpName,
  deleteAdjustment
}) {
  return (
    <>
      <div className="section-head">
        <h2>إدارة المكافآت والخصومات</h2>
      </div>
      <div className="card">
        <div className="form-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '14px' }}>
          <div className="field" style={{ flex: '1 1 130px', minWidth: '120px' }}>
            <label htmlFor="aType">نوع التسوية</label>
            <select id="aType" value={aType} onChange={(e) => setAType(e.target.value)}>
              <option value="bonus">مكافأة (+)</option>
              <option value="deduction">خصم (-)</option>
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 180px', minWidth: '150px' }}>
            <label htmlFor="aEmpId">الموظف المستهدف</label>
            <select id="aEmpId" value={aEmpId} onChange={(e) => setAEmpId(e.target.value)}>
              <option value="all">كافة الموظفين (عام)</option>
              {state.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.jobTitle})
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 130px', minWidth: '120px' }}>
            <label htmlFor="aDate">التاريخ</label>
            <input type="date" id="aDate" value={aDate} onChange={(e) => setADate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '1 1 110px', minWidth: '100px' }}>
            <label htmlFor="aAmount">المبلغ (ج.م)</label>
            <input
              type="number"
              id="aAmount"
              min="1"
              step="0.01"
              placeholder="0.00"
              value={aAmount}
              onChange={(e) => setAAmount(e.target.value)}
            />
          </div>
          <div className="field grow" style={{ flex: '2 1 180px', minWidth: '150px' }}>
            <label htmlFor="aDesc">البيان / السبب</label>
            <input
              type="text"
              id="aDesc"
              placeholder="مثال: مكافأة تميز وإنجاز"
              value={aDesc}
              onChange={(e) => setADesc(e.target.value)}
            />
          </div>
          <button
            className="btn btn-accent"
            onClick={addAdjustment}
            style={{ height: '42px', padding: '0 22px', flexShrink: 0, alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
          >
            إضافة التسوية
          </button>
        </div>

        <div style={{ marginTop: '20px' }}>
          <table style={{ border: '1px solid var(--border)', borderRadius: '10px' }}>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الموظف</th>
                <th>النوع</th>
                <th>المبلغ</th>
                <th>البيان</th>
                <th>حذف</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdjustments.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan="6">لا توجد مكافآت أو خصومات هذا الشهر</td>
                </tr>
              ) : (
                filteredAdjustments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.date}</td>
                    <td>{a.employeeId === 'all' ? 'جميع الموظفين' : getEmpName(a.employeeId)}</td>
                    <td>
                      <span className={`tag ${a.type === 'bonus' ? 'tag-bonus' : 'tag-deduction'}`}>
                        {a.type === 'bonus' ? 'مكافأة (+)' : 'خصم (-)'}
                      </span>
                    </td>
                    <td className="money" style={{ color: a.type === 'bonus' ? 'var(--success)' : 'var(--danger)' }}>
                      {fmt(a.amount)} ج.م
                    </td>
                    <td>{a.description || '—'}</td>
                    <td>
                      <button className="del-btn" onClick={() => deleteAdjustment(a.id)}>
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
