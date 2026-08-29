import React from 'react';

export default function EmployeeIDCardModal({
  selectedEmpCard,
  setSelectedEmpCard,
  orgSettings,
  qrCardDataUrl
}) {
  if (!selectedEmpCard) return null;

  return (
    <div className="modal-overlay" onClick={() => setSelectedEmpCard(null)}>
      <div className="modal-card vip-badge-card" onClick={(e) => e.stopPropagation()}>
        <div className="vip-badge-header">
          {orgSettings.logoUrl ? (
            <img src={orgSettings.logoUrl} alt="Logo" className="vip-badge-logo" />
          ) : (
            <div className="vip-badge-mark">HR</div>
          )}
          <div>
            <h3>{orgSettings.orgName || 'بطاقة موظف رسمية'}</h3>
            <span>Official Employee Identity Pass</span>
          </div>
          <button className="close-btn" style={{ marginRight: 'auto', color: '#fff' }} onClick={() => setSelectedEmpCard(null)}>✕</button>
        </div>

        <div className="vip-badge-body">
          <div className="vip-photo-ring">
            {selectedEmpCard.photoUrl ? (
              <img src={selectedEmpCard.photoUrl} alt={selectedEmpCard.nickname || selectedEmpCard.name} />
            ) : (
              <div className="badge-avatar-placeholder">{(selectedEmpCard.nickname || selectedEmpCard.name).charAt(0)}</div>
            )}
          </div>

          <h2>{selectedEmpCard.nickname || selectedEmpCard.name}</h2>
          {selectedEmpCard.nickname && selectedEmpCard.nickname.trim() !== selectedEmpCard.name?.trim() && (
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '-4px', marginBottom: '4px' }}>
              الاسم الرسمي: {selectedEmpCard.name}
            </div>
          )}
          <p className="vip-badge-job">{selectedEmpCard.jobTitle}</p>
          {selectedEmpCard.phone && <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>📞 {selectedEmpCard.phone}</div>}

          <div className="vip-badge-code-tag">كود البصمة: {selectedEmpCard.code}</div>

          {qrCardDataUrl && (
            <div className="vip-qr-container">
              <img src={qrCardDataUrl} alt="QR Code" />
              <span>رمز QR للبصمة الإلكترونية المعتمدة</span>
            </div>
          )}

          {selectedEmpCard.driveFolderUrl && (
            <div style={{ marginTop: '10px' }}>
              <a
                href={selectedEmpCard.driveFolderUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '12px',
                  color: '#0284c7',
                  fontWeight: 'bold',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  textDecoration: 'none',
                  background: '#f0f9ff',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #bae6fd'
                }}
              >
                📁 مجلد الوثائق على Google Drive ↗
              </a>
            </div>
          )}
        </div>

        <button className="btn btn-start" style={{ width: '100%', marginTop: '16px' }} onClick={() => window.print()}>
          🖨️ طباعة بطاقة الموظف الرسمية
        </button>
      </div>
    </div>
  );
}
