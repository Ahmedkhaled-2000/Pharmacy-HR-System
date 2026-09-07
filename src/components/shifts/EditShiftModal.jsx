import React from 'react';

export default function EditShiftModal({ editingShift, setEditingShift, saveEditShift }) {
  if (!editingShift) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) setEditingShift(null);
      }}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0 }}>تعديل الوردية</h3>
          <button
            type="button"
            className="modal-close-circle-btn"
            onClick={() => setEditingShift(null)}
            aria-label="إغلاق"
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '50%',
              width: '30px',
              height: '30px',
              cursor: 'pointer',
              fontSize: '15px'
            }}
          >
            ✕
          </button>
        </div>
        <div className="form-row" style={{ flexDirection: 'column', gap: '12px' }}>
          <div className="field grow">
            <label>التاريخ</label>
            <input
              type="date"
              value={editingShift.date}
              onChange={(e) => setEditingShift({ ...editingShift, date: e.target.value })}
            />
          </div>
          <div className="field grow">
            <label>وقت الدخول</label>
            <input
              type="time"
              value={editingShift.timeIn}
              onChange={(e) => setEditingShift({ ...editingShift, timeIn: e.target.value })}
            />
          </div>
          <div className="field grow">
            <label>وقت الخروج</label>
            <input
              type="time"
              value={editingShift.timeOut}
              onChange={(e) => setEditingShift({ ...editingShift, timeOut: e.target.value })}
            />
          </div>
          <div className="field grow">
            <label>البريك (ساعات)</label>
            <input
              type="number"
              step="0.25"
              value={editingShift.breakHours}
              onChange={(e) => setEditingShift({ ...editingShift, breakHours: e.target.value })}
            />
          </div>
          <div className="field grow">
            <label>ملاحظة</label>
            <input
              type="text"
              value={editingShift.note || ''}
              onChange={(e) => setEditingShift({ ...editingShift, note: e.target.value })}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setEditingShift(null)}>
            إلغاء
          </button>
          <button className="btn btn-start" onClick={saveEditShift}>
            حفظ التغييرات
          </button>
        </div>
      </div>
    </div>
  );
}
