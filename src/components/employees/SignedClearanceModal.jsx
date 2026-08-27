import React, { useState, useRef } from 'react';
import { compressImage } from '../../utils/imageCompressor';
import { getRealTodayStr } from '../../utils/formatters';

export default function SignedClearanceModal({
  emp,
  onClose,
  onSaveSignedDoc,
  executeWithOwnerGuard
}) {
  const [fileData, setFileData] = useState(emp?.signedClearanceDoc?.url || null);
  const [fileName, setFileName] = useState(emp?.signedClearanceDoc?.fileName || '');
  const [fileType, setFileType] = useState(emp?.signedClearanceDoc?.fileType || '');
  const [signedDate, setSignedDate] = useState(emp?.signedClearanceDoc?.signedDate || getRealTodayStr());
  const [notes, setNotes] = useState(emp?.signedClearanceDoc?.notes || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const fileInputRef = useRef(null);

  if (!emp) return null;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      let base64Url;

      if (isPdf) {
        // Read PDF as DataURL directly
        const reader = new FileReader();
        base64Url = await new Promise((resolve, reject) => {
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = (err) => reject(err);
          reader.readAsDataURL(file);
        });
        setFileType('pdf');
      } else {
        // Compress Image for lightweight storage
        base64Url = await compressImage(file, 1600, 0.82);
        setFileType('image');
      }

      setFileData(base64Url);
      setFileName(file.name);
    } catch (err) {
      console.error('Error reading/compressing clearance document:', err);
      alert('حدث خطأ أثناء قراءة المستند. يرجى التأكد من صلاحية الملف والمحاولة مجدداً.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = () => {
    if (!fileData) {
      alert('يرجى اختيار أو رفع صورة/مستند إخلاء الطرف الموقع أولاً');
      return;
    }

    const payload = {
      url: fileData,
      fileName: fileName || `clearance_${emp.code || emp.id}.jpg`,
      fileType: fileType || 'image',
      signedDate,
      notes: notes.trim(),
      uploadedAt: new Date().toISOString()
    };

    if (onSaveSignedDoc) {
      onSaveSignedDoc(emp.id, payload);
    }
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm('هل أنت متأكد من رغبتك في حذف مستند إخلاء الطرف الموقع لهذا الموظف؟')) {
      if (onSaveSignedDoc) {
        onSaveSignedDoc(emp.id, null);
      }
      setFileData(null);
      setFileName('');
      onClose();
    }
  };

  const handleDownload = () => {
    if (!fileData) return;
    const a = document.createElement('a');
    a.href = fileData;
    a.download = fileName || `إخلاء_طرف_موقع_${emp.name}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isExistingDoc = Boolean(emp?.signedClearanceDoc?.url);

  return (
    <div className="modal-backdrop" style={{ zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        className="modal-content card"
        style={{
          maxWidth: '780px',
          width: '94%',
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: '16px',
          padding: '24px'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--primary-dark)', fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📄 أرشفة ورفع نموذج إخلاء الطرف الموقع
            </h3>
            <span style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
              الموظف: <strong>{emp.name} ({emp.code || '—'})</strong>
            </span>
          </div>
          <button className="del-btn" onClick={onClose}>✕</button>
        </div>

        {/* Upload Zone / Document Preview Area */}
        <div style={{ marginBottom: '18px' }}>
          {!fileData ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--primary)',
                background: '#f0fdfa',
                borderRadius: '14px',
                padding: '36px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = '#ccfbf1'; }}
              onDragLeave={(e) => { e.currentTarget.style.background = '#f0fdfa'; }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.style.background = '#f0fdfa';
                if (e.dataTransfer.files?.[0]) {
                  handleFileChange({ target: { files: e.dataTransfer.files } });
                }
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,application/pdf"
                style={{ display: 'none' }}
              />
              <span style={{ fontSize: '48px', display: 'block', marginBottom: '10px' }}>📤</span>
              <h4 style={{ margin: '0 0 6px', color: 'var(--primary-dark)', fontSize: '16px' }}>
                اضغط لاختيار أو سحب وإفلات صورة / مستند إخلاء الطرف الموقع
              </h4>
              <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: 'var(--muted)' }}>
                يدعم كافة الصور (JPG, PNG, WebP) وملفات PDF مع ضغط فوري لتوفير المساحة
              </p>
              <button
                type="button"
                className="btn btn-start"
                style={{ fontSize: '13px', padding: '8px 18px', pointerEvents: 'none' }}
              >
                📸 التقاط صورة أو اختيار ملف من الجهاز
              </button>
            </div>
          ) : (
            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--primary-dark)' }}>
                  {fileType === 'pdf' ? '📑 مستند PDF' : '🖼️ صورة المستند الموقع'}: {fileName}
                </span>

                {/* Preview Toolbar */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {fileType !== 'pdf' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                        onClick={() => setZoomLevel(prev => Math.min(prev + 0.25, 2.5))}
                        title="تكبير"
                      >
                        🔍+
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                        onClick={() => setZoomLevel(prev => Math.max(prev - 0.25, 0.5))}
                        title="تصغير"
                      >
                        🔍-
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: '12px', background: '#fff', border: '1px solid var(--border)' }}
                    onClick={handleDownload}
                    title="تحميل المستند"
                  >
                    💾 تحميل
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: '12px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}
                    onClick={() => { setFileData(null); setFileName(''); }}
                    title="تغيير الملف"
                  >
                    🔄 تغيير الملف
                  </button>
                </div>
              </div>

              {/* View Box */}
              <div style={{ maxHeight: '420px', overflow: 'auto', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                {fileType === 'pdf' ? (
                  <iframe src={fileData} style={{ width: '100%', height: '380px', border: 'none' }} title="Signed Clearance PDF" />
                ) : (
                  <img
                    src={fileData}
                    alt="Signed Clearance Slip"
                    style={{
                      maxWidth: '100%',
                      transform: `scale(${zoomLevel})`,
                      transformOrigin: 'top center',
                      transition: 'transform 0.15s ease',
                      borderRadius: '4px'
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Form Fields: Date & Notes */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '18px' }}>
          <div className="field">
            <label style={{ fontWeight: 'bold', fontSize: '13px' }}>📅 تاريخ توقيع واستلام إخلاء الطرف *</label>
            <input
              type="date"
              value={signedDate}
              onChange={(e) => setSignedDate(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
              required
            />
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontWeight: 'bold', fontSize: '13px' }}>📝 ملاحظات الأرشفة والاعتماد (اختياري)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: تم التوقيع بحضور المدير المالي وتسليم أصل المستند للأرشيف المركزي..."
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          {isExistingDoc ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleDelete}
              style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', fontWeight: 'bold', fontSize: '12.5px' }}
            >
              🗑️ حذف المستند المؤرشف
            </button>
          ) : <div></div>}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              إلغاء
            </button>
            <button
              type="button"
              className="btn btn-start"
              onClick={handleSave}
              disabled={isProcessing || !fileData}
              style={{ fontWeight: 'bold', padding: '9px 22px', fontSize: '13.5px' }}
            >
              {isProcessing ? '⏳ جاري المعالجة...' : '💾 حفظ وأرشفة المستند'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
