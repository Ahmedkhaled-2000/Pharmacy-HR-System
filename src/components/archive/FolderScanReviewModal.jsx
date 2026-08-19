import React, { useState } from 'react';

export default function FolderScanReviewModal({
  isOpen,
  onClose,
  settings = {},
  onConfirmBatch = () => {}
}) {
  const [scanPath, setScanPath] = useState(settings?.AUTO_SCAN_FOLDER_PATH || '');
  const [isScanning, setIsScanning] = useState(false);
  const [scannedFiles, setScannedFiles] = useState([]);
  const [msg, setMsg] = useState('');

  if (!isOpen) return null;

  const handleStartScan = async () => {
    if (!scanPath.trim()) {
      setMsg('يرجى تحديد مسار المجلد أولاً');
      return;
    }

    setIsScanning(true);
    setMsg('جاري فحص المجلد والبحث عن فواتير جديدة...');

    // Simulate scan or query server
    setTimeout(() => {
      setIsScanning(false);
      setMsg('✅ اكتمل الفحص');
      setScannedFiles([
        { name: 'invoice_march_01.pdf', size: '240 KB', detectedSupplier: 'ابن سينا فارما', status: 'ready' },
        { name: 'inv_united_2026.png', size: '1.2 MB', detectedSupplier: 'المتحدة للصيادلة', status: 'ready' },
      ]);
    }, 1200);
  };

  return (
    <div className="arch-modal-overlay" onClick={onClose}>
      <div className="arch-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px' }}>
        
        <div className="arch-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📁</span>
            <h3>فحص المجلد الآلي للفواتير</h3>
          </div>
          <button className="arch-btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="arch-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="arch-input-group">
            <label className="arch-input-label">مسار المجلد المحلي للفحص</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="arch-input"
                value={scanPath}
                onChange={(e) => setScanPath(e.target.value)}
                placeholder="C:\Invoices_Inbox"
              />
              <button
                type="button"
                className="arch-btn-primary"
                onClick={handleStartScan}
                disabled={isScanning}
                style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}
              >
                {isScanning ? '⏳ جاري الفحص...' : '🚀 بدء الفحص'}
              </button>
            </div>
          </div>

          {msg && (
            <div style={{ fontSize: '0.85rem', color: '#60a5fa', fontWeight: 600 }}>
              {msg}
            </div>
          )}

          {scannedFiles.length > 0 && (
            <div className="arch-table-responsive">
              <table className="arch-table">
                <thead>
                  <tr>
                    <th>اسم الملف</th>
                    <th>الحجم</th>
                    <th>المورد المتوقع</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {scannedFiles.map((file, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700 }}>{file.name}</td>
                      <td style={{ color: '#94a3b8' }}>{file.size}</td>
                      <td style={{ color: '#60a5fa' }}>{file.detectedSupplier}</td>
                      <td>
                        <span className="arch-badge green">جاهز للاستخراج</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="arch-modal-footer">
          <button type="button" className="arch-btn-secondary" onClick={onClose}>إغلاق</button>
          {scannedFiles.length > 0 && (
            <button
              type="button"
              className="arch-btn-primary"
              onClick={() => {
                onConfirmBatch(scannedFiles);
                onClose();
              }}
            >
              📥 استيراد واستخراج الفواتير
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
