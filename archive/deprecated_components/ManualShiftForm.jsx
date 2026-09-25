import React from 'react';
import { getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';

export default function ManualShiftForm({
  state,
  mEmpId,
  setMEmpId,
  mDate,
  setMDate,
  mIn,
  setMIn,
  mOut,
  setMOut,
  mBreak,
  setMBreak,
  mNote,
  setMNote,
  addManualShift
}) {
  return (
    <>
      <div className="section-head">
        <h2>إضافة وردية يدوياً</h2>
      </div>
      <div className="card">
        <div className="form-row" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '14px' }}>
          <div className="field" style={{ flex: '1 1 180px', minWidth: '150px' }}>
            <label htmlFor="mEmpId">الموظف</label>
            <select id="mEmpId" value={mEmpId} onChange={(e) => setMEmpId(e.target.value)}>
              <option value="">-- اختر الموظف --</option>
              {(state.employees || []).filter(isEmployeeActive).map((e) => (
                <option key={e.id} value={e.id}>
                  {getEmpDisplayName(e)} (كود: {e.code})
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 130px', minWidth: '120px' }}>
            <label htmlFor="mDate">التاريخ</label>
            <input type="date" id="mDate" value={mDate} onChange={(e) => setMDate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '1 1 110px', minWidth: '100px' }}>
            <label htmlFor="mIn">وقت الدخول</label>
            <input type="time" id="mIn" value={mIn} onChange={(e) => setMIn(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '1 1 110px', minWidth: '100px' }}>
            <label htmlFor="mOut">وقت الخروج</label>
            <input type="time" id="mOut" value={mOut} onChange={(e) => setMOut(e.target.value)} />
          </div>
          <div className="field" style={{ flex: '1 1 100px', minWidth: '90px' }}>
            <label htmlFor="mBreak">البريك (ساعات)</label>
            <input
              type="number"
              id="mBreak"
              min="0"
              step="0.25"
              placeholder="0"
              value={mBreak}
              onChange={(e) => setMBreak(e.target.value)}
            />
          </div>
          <div className="field grow" style={{ flex: '2 1 180px', minWidth: '150px' }}>
            <label htmlFor="mNote">ملاحظة (اختياري)</label>
            <input
              type="text"
              id="mNote"
              placeholder="مثال: إضافة ساعات عمل إضافية"
              value={mNote}
              onChange={(e) => setMNote(e.target.value)}
            />
          </div>
          <button
            className="btn btn-start"
            onClick={addManualShift}
            style={{ height: '42px', padding: '0 22px', flexShrink: 0, alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
          >
            إضافة الوردية
          </button>
        </div>
      </div>
    </>
  );
}
