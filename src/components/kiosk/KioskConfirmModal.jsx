import React from 'react';

export default function KioskConfirmModal({ kioskConfirmModal }) {
  if (!kioskConfirmModal || !kioskConfirmModal.open) return null;

  return (
    <div className="modal-overlay kiosk-modal-overlay">
      <div className="kiosk-success-card pop-in" style={{ color: '#ffffff' }}>
        <div className="success-checkmark-icon">✓</div>
        <h2 style={{ color: '#ffffff' }}>تأكيد تسجيل الحضور</h2>
        <h3 style={{ color: '#ffffff' }}>{kioskConfirmModal.empName}</h3>
        <p className="kiosk-msg" style={{ color: '#ffffff' }}>{kioskConfirmModal.message}</p>
        <div className="kiosk-time-tag" style={{ color: '#ffffff', background: 'rgba(255,255,255,0.2)' }}>⏱️ {kioskConfirmModal.timestamp}</div>
      </div>
    </div>
  );
}
