import React, { useState } from 'react';
import { useUI } from '../../context/UIContext';
import { uploadExpenseAttachmentToDrive } from '../../utils/googleDriveService';

export default function IncomeExpensesModule({
  state,
  setState,
  saveState,
  showToast,
  currentBranch,
  userRole,
  filterFn = null,
  monthPicker,
  filterMode,
  customFrom,
  customTo
}) {
  const { showConfirm } = useUI();
  const [isMobileScreen, setIsMobileScreen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  React.useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isBranchRole = userRole === 'branch' || !!currentBranch;
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'expense' | 'income'
  const [selectedBranch, setSelectedBranch] = useState(currentBranch?.id || '');
  
  // New Entry Form State
  const [type, setType] = useState('expense'); // 'expense' | 'income'
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [branchId, setBranchId] = useState(currentBranch?.id || '');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  // Attachment State
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentData, setAttachmentData] = useState('');
  const [attachmentType, setAttachmentType] = useState('');
  const [attachmentSize, setAttachmentSize] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [previewAttachmentModal, setPreviewAttachmentModal] = useState(null);

  const branches = state.branches || [];
  const transactions = state.finances || state.transactions || [];

  const filteredList = transactions.filter((t) => {
    if (activeTab !== 'all' && t.type !== activeTab) return false;
    if (filterFn && !filterFn(t.date || (t.createdAt ? t.createdAt.slice(0, 10) : ''))) return false;
    if (isBranchRole) {
      return String(t.branchId) === String(currentBranch?.id);
    }
    if (selectedBranch && String(t.branchId) !== String(selectedBranch)) return false;
    return true;
  });

  const totalIncome = filteredList
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  const totalExpenses = filteredList
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  const netBalance = totalIncome - totalExpenses;

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      showToast?.('⚠️ حجم الملف كبير جداً. الحد الأقصى 25 ميجابايت.');
      return;
    }

    let detectedType = 'file';
    if (file.type.startsWith('image/')) detectedType = 'image';
    else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) detectedType = 'pdf';

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachmentData(ev.target.result);
      setAttachmentName(file.name);
      setAttachmentType(detectedType);
      const sizeStr = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} ميجابايت`
        : `${Math.round(file.size / 1024)} كيلوبايت`;
      setAttachmentSize(sizeStr);
      setIsUploading(false);
    };
    reader.onerror = () => {
      showToast?.('❌ تعذر قراءة الملف المرفق.');
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAttachment = () => {
    setAttachmentName('');
    setAttachmentData('');
    setAttachmentType('');
    setAttachmentSize('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0 || !category.trim()) {
      showToast?.('يرجى تحديد المبلغ والتصنيف بشكل صحيح');
      return;
    }

    const targetBranchId = currentBranch?.id || branchId || '';
    const branchObj = branches.find((b) => b.id === targetBranchId) || currentBranch;
    const branchName = branchObj?.name || 'المركز الرئيسي / عام';

    // ── رفع الملف إلى Google Drive في مجلد "مصروفات" ثم مجلد الشهر (مثل: 2026-09) ──
    let driveUploadInfo = null;
    const driveConfig = state?.orgSettings?.driveConfig;
    const isDriveActive = driveConfig && driveConfig.enabled && driveConfig.serviceUrl;

    if (attachmentData && isDriveActive) {
      try {
        const monthStr = date.slice(0, 7);
        showToast?.('☁️ جاري رفع المرفق إلى Google Drive بمجلد مصروفات / ' + monthStr + '...');
        driveUploadInfo = await uploadExpenseAttachmentToDrive({
          fileContent: attachmentData,
          fileName: attachmentName,
          mimeType: attachmentType === 'pdf' ? 'application/pdf' : 'image/jpeg',
          monthStr,
          type,
          category: category.trim(),
          branchName,
          dateStr: date,
          driveConfig
        });
      } catch (err) {
        console.warn('Failed to upload to Google Drive, retaining local attachment:', err);
        showToast?.('⚠️ تعذر رفع الملف إلى جوجل درايف، تم حفظه محلياً في المنظومة');
      }
    }

    const newTransaction = {
      id: `tx_${Date.now()}`,
      type,
      category: category.trim(),
      amount: parsedAmount,
      branchId: targetBranchId,
      branchName: branchName,
      createdBy: isBranchRole ? `مدير فرع ${branchName}` : 'admin',
      notes: notes.trim(),
      attachmentName: attachmentName || null,
      attachmentData: attachmentData || null,
      attachmentType: attachmentType || null,
      attachmentSize: attachmentSize || null,
      driveFileId: driveUploadInfo?.fileId || null,
      driveFileUrl: driveUploadInfo?.fileUrl || null,
      driveWebViewLink: driveUploadInfo?.webViewLink || null,
      driveMonthFolderUrl: driveUploadInfo?.monthFolderUrl || null,
      date,
      createdAt: new Date().toISOString()
    };

    // If added by branch manager, also create an alert/notification for Top Management!
    let updatedNotifs = state.notifications || [];
    if (isBranchRole) {
      const newNotif = {
        id: `notif_fin_${Date.now()}`,
        type: 'financial_alert',
        title: `📈 قيد مالي جديد: فرع ${branchName}`,
        message: `قام مدير فرع ${branchName} بإدراج ${type === 'expense' ? 'مصروف' : 'إيراد'} بقيمة ${parsedAmount} ج.م (البند: ${category.trim()})`,
        date,
        timestamp: new Date().toISOString(),
        read: false,
        targetRole: 'admin',
        branchId: targetBranchId
      };
      updatedNotifs = [newNotif, ...updatedNotifs];
    }

    const updated = [newTransaction, ...transactions];
    const updatedState = { ...state, finances: updated, transactions: updated, notifications: updatedNotifs };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    showToast?.('✅ تم إضافة البند وتعديل الإجماليات بنجاح!');
    setCategory('');
    setAmount('');
    setNotes('');
    handleRemoveAttachment();
  };

  const handleDelete = async (id) => {
    const isConfirmed = await showConfirm({
      title: 'حذف بند مالي',
      message: 'هل أنت متأكد من حذف هذا البند المالي نهائياً؟',
      confirmText: 'تأكيد الحذف',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '🗑️'
    });
    if (!isConfirmed) return;
    const updated = transactions.filter((t) => t.id !== id);
    const updatedDeleted = [...(state._deletedIds || []), String(id)];
    const updatedState = { ...state, finances: updated, transactions: updated, _deletedIds: updatedDeleted };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    showToast?.('🗑️ تم حذف البند المالي بنجاح');
  };

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            {isBranchRole
              ? `📈 إدارة المصروفات والإيرادات — فرع ${currentBranch?.name || ''}`
              : '📈 إدارة المصروفات والإيرادات للشركة'}
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            {isBranchRole
              ? `تسجيل وإدارة حركة المصروفات والإيرادات اليومية الخاصة بفرع ${currentBranch?.name || ''}`
              : 'تسجيل وإدارة حركة المصروفات والإيرادات اليومية وتأثيرها المباشر على الحسابات العامة'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'all' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('all')}
          >
            📋 الكشف الشامل ({filteredList.length})
          </button>
          <button
            className={`btn ${activeTab === 'income' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('income')}
          >
            🟢 الإيرادات فقط
          </button>
          <button
            className={`btn ${activeTab === 'expense' ? 'btn-start' : 'btn-ghost'}`}
            onClick={() => setActiveTab('expense')}
          >
            🔴 المصروفات فقط
          </button>
        </div>
      </div>

      {/* Summary Financial Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', padding: '18px', borderRadius: '12px' }}>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>🟢 إجمالي الإيرادات المسجلة</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: '900' }}>{totalIncome.toLocaleString()} ج.م</h3>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', padding: '18px', borderRadius: '12px' }}>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>🔴 إجمالي المصروفات المسجلة</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: '900' }}>{totalExpenses.toLocaleString()} ج.م</h3>
        </div>

        <div style={{ background: netBalance >= 0 ? 'linear-gradient(135deg, #0d9488, #0f766e)' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', padding: '18px', borderRadius: '12px' }}>
          <span style={{ fontSize: '13px', opacity: 0.9 }}>📊 صافي الرصيد المالي</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '24px', fontWeight: '900' }}>{netBalance.toLocaleString()} ج.م</h3>
        </div>
      </div>

      {/* Add New Transaction Form */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px', marginBottom: '24px' }}>
        <h4 style={{ margin: '0 0 14px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
          ➕ تسجيل حركة مالية جديدة ({isBranchRole ? `فرع ${currentBranch?.name || ''}` : 'إيراد / مصروف'})
        </h4>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          <div className="field">
            <label>نوع الحركة</label>
            <select value={type} onChange={(e) => setType(e.target.value)} required>
              <option value="expense">🔴 مصروفات (تخصم)</option>
              <option value="income">🟢 إيرادات (تضاف)</option>
            </select>
          </div>

          <div className="field">
            <label>التصنيف / البيان</label>
            <input
              type="text"
              placeholder="مثال: فواتير كهرباء، إيجار، مبيعات..."
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label>المبلغ (ج.م)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="أدخل المبلغ..."
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label>الفرع المعني</label>
            {isBranchRole ? (
              <input
                type="text"
                value={`📍 فرع ${currentBranch?.name || ''}`}
                disabled
                style={{ background: 'var(--surface-muted)', fontWeight: 'bold', border: '1px solid var(--border)', color: 'var(--primary-dark)' }}
              />
            ) : (
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">-- عام / المركز الرئيسي --</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="field">
            <label>التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>ملاحظات بيانية</label>
            <input type="text" placeholder="اكتب أي ملاحظات إضافية..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {/* File Attachment / Invoice / Receipt */}
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>📎 إرفاق ملف / فاتورة / إيصال (اختياري)</span>
              {state?.orgSettings?.driveConfig?.enabled ? (
                <span style={{ fontSize: '11px', color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                  ☁️ رفع مباشر إلى Google Drive (مجلد مصروفات / {date ? date.slice(0, 7) : 'الشهر'})
                </span>
              ) : (
                <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                  💾 حفظ محلي في المنظومة
                </span>
              )}
            </label>

            {!attachmentData ? (
              <div
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: '10px',
                  padding: '16px',
                  textAlign: 'center',
                  background: 'var(--surface-muted)',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => !isUploading && document.getElementById('expense-attachment-input')?.click()}
              >
                <input
                  id="expense-attachment-input"
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
                <div style={{ fontSize: '26px', marginBottom: '6px' }}>
                  {isUploading ? '⏳' : '🧾'}
                </div>
                <p style={{ margin: '0 0 4px 0', fontSize: '13.5px', fontWeight: 'bold', color: 'var(--text)' }}>
                  {isUploading ? 'جاري قراءة الملف المرفق...' : 'اضغط لاختيار صورة الإيصال أو ملف PDF (حتى 25 ميجابايت)'}
                </p>
                <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                  يدعم صور الفواتير (JPG, PNG, WEBP) ومستندات PDF — يتم أرشفة الملفات شهرياً
                </span>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'var(--surface-muted)',
                  border: '1px solid #10b981',
                  borderRadius: '10px',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {attachmentType === 'image' ? (
                    <img
                      src={attachmentData}
                      alt="preview"
                      style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                  ) : (
                    <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold' }}>
                      PDF
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--text)' }}>
                      {attachmentName}
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                      الحجم: {attachmentSize} • النوع: {attachmentType === 'pdf' ? 'مستند PDF' : 'صورة'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => setPreviewAttachmentModal({
                      attachmentName,
                      attachmentData,
                      attachmentType,
                      attachmentSize,
                      category,
                      amount,
                      date
                    })}
                  >
                    👁️ معاينة
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: '12px', color: '#dc2626', borderColor: 'rgba(220,38,38,0.2)' }}
                    onClick={handleRemoveAttachment}
                  >
                    ❌ إزالة الملف
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-start" disabled={isUploading}>
              💾 تسجيل وحفظ الحركة المالية
            </button>
          </div>
        </form>
      </div>

      {/* Filter and Table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>
          📋 سجل الحركة المالية الحالية {isBranchRole ? `(فرع ${currentBranch?.name || ''})` : ''}
        </h4>
        {!isBranchRole && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', fontWeight: 'bold' }}>تصفية بالفرع:</label>
            <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
              <option value="">-- جميع الفروع --</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isMobileScreen ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px', border: '1px solid var(--border)' }}>
              لا توجد حركات مالية مسجلة حتى الآن.
            </div>
          ) : (
            filteredList.map((t, idx) => (
              <div
                key={t.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.03)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--muted)' }}>#{idx + 1}</span>
                    {t.type === 'income' ? (
                      <span className="badge badge-success" style={{ fontSize: '11.5px' }}>🟢 إيراد</span>
                    ) : (
                      <span className="badge badge-danger" style={{ fontSize: '11.5px' }}>🔴 مصروف</span>
                    )}
                  </div>
                  <strong style={{ fontSize: '14px', color: t.type === 'income' ? '#16a34a' : '#dc2626' }}>
                    {t.type === 'income' ? '+' : '-'}{parseFloat(t.amount).toLocaleString()} ج.م
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                  <div>
                    <span style={{ fontWeight: 800, color: 'var(--text)' }}>{t.category}</span>
                    <span style={{ fontSize: '11.5px', color: 'var(--muted)', display: 'block' }}>🏢 {t.branchName || 'عام'}</span>
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>📅 {t.date}</span>
                </div>

                {t.notes && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--surface-muted)', padding: '6px 10px', borderRadius: '6px' }}>
                    💬 {t.notes}
                  </div>
                )}

                {/* Attachment Badge / View Button in Mobile Card */}
                {(t.attachmentData || t.driveFileUrl || t.driveWebViewLink) && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', paddingTop: '4px' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '4px 10px', fontSize: '11.5px', color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff', fontWeight: 'bold' }}
                      onClick={() => setPreviewAttachmentModal(t)}
                    >
                      📎 عرض المرفق / الفاتورة
                    </button>
                    {t.driveWebViewLink && (
                      <a
                        href={t.driveWebViewLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: '11.5px', color: '#10b981', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                      >
                        ☁️ Google Drive
                      </a>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: '11.5px', color: '#dc2626', fontWeight: 'bold', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '6px' }}
                    onClick={() => handleDelete(t.id)}
                  >
                    🗑️ حذف الحركة
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="bylaws-table">
            <thead>
              <tr>
                <th>#</th>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>التصنيف / البيان</th>
                <th>الفرع</th>
                <th>المبلغ</th>
                <th>المرفق / الإيصال</th>
                <th>الملاحظات</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا توجد حركات مالية مسجلة حتى الآن.</td></tr>
              ) : (
                filteredList.map((t, idx) => (
                  <tr key={t.id}>
                    <td>{idx + 1}</td>
                    <td>{t.date}</td>
                    <td>
                      {t.type === 'income' ? (
                        <span className="badge badge-success">🟢 إيراد</span>
                      ) : (
                        <span className="badge badge-danger">🔴 مصروف</span>
                      )}
                    </td>
                    <td style={{ fontWeight: '700' }}>{t.category}</td>
                    <td>{t.branchName || 'عام'}</td>
                    <td style={{ fontWeight: '800', color: t.type === 'income' ? '#16a34a' : '#dc2626' }}>
                      {t.type === 'income' ? '+' : '-'}{parseFloat(t.amount).toLocaleString()} ج.م
                    </td>
                    <td>
                      {(t.attachmentData || t.driveFileUrl || t.driveWebViewLink) ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ padding: '3px 8px', fontSize: '11.5px', color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff' }}
                            onClick={() => setPreviewAttachmentModal(t)}
                            title="معاينة المرفق"
                          >
                            📎 عرض
                          </button>
                          {t.driveWebViewLink && (
                            <a
                              href={t.driveWebViewLink}
                              target="_blank"
                              rel="noreferrer"
                              title="فتح في Google Drive"
                              style={{ textDecoration: 'none', fontSize: '14px' }}
                            >
                              ☁️
                            </a>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '12.5px' }}>{t.notes || '—'}</td>
                    <td>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--danger)' }}
                        onClick={() => handleDelete(t.id)}
                      >
                        🗑️ حذف
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Attachment Preview Modal */}
      {previewAttachmentModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '16px'
          }}
          onClick={() => setPreviewAttachmentModal(null)}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '16px',
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
              border: '1px solid var(--border)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontFamily: 'Cairo', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📎 معاينة إيصال / فاتورة الحركة المالية</span>
                  {previewAttachmentModal.driveWebViewLink && (
                    <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px' }}>
                      ☁️ محفوظ على Google Drive
                    </span>
                  )}
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                  {previewAttachmentModal.category} • {previewAttachmentModal.amount ? `${previewAttachmentModal.amount} ج.م` : ''} • {previewAttachmentModal.date || ''}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: '16px', padding: '4px 8px' }}
                onClick={() => setPreviewAttachmentModal(null)}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-muted)' }}>
              {previewAttachmentModal.attachmentType === 'image' || (previewAttachmentModal.attachmentData && previewAttachmentModal.attachmentData.startsWith('data:image')) ? (
                <img
                  src={previewAttachmentModal.attachmentData}
                  alt={previewAttachmentModal.attachmentName || 'فاتورة'}
                  style={{ maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              ) : previewAttachmentModal.attachmentType === 'pdf' || (previewAttachmentModal.attachmentData && previewAttachmentModal.attachmentData.startsWith('data:application/pdf')) ? (
                <iframe
                  src={previewAttachmentModal.attachmentData}
                  title="PDF Preview"
                  style={{ width: '100%', height: '65vh', border: 'none', borderRadius: '8px' }}
                />
              ) : previewAttachmentModal.driveWebViewLink ? (
                <iframe
                  src={previewAttachmentModal.driveWebViewLink.replace('/view', '/preview')}
                  title="Drive Preview"
                  style={{ width: '100%', height: '65vh', border: 'none', borderRadius: '8px' }}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '32px' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
                  <p style={{ fontWeight: 'bold' }}>{previewAttachmentModal.attachmentName || 'مرفق الحركة المالية'}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {previewAttachmentModal.attachmentData && (
                  <a
                    href={previewAttachmentModal.attachmentData}
                    download={previewAttachmentModal.attachmentName || `receipt_${previewAttachmentModal.date || 'file'}`}
                    className="btn btn-ghost"
                    style={{ fontSize: '12.5px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    📥 تنزيل الملف
                  </a>
                )}
                {previewAttachmentModal.driveWebViewLink && (
                  <a
                    href={previewAttachmentModal.driveWebViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost"
                    style={{ fontSize: '12.5px', color: '#0284c7', borderColor: '#bae6fd', background: '#f0f9ff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    ☁️ فتح في Google Drive
                  </a>
                )}
                {previewAttachmentModal.driveMonthFolderUrl && (
                  <a
                    href={previewAttachmentModal.driveMonthFolderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost"
                    style={{ fontSize: '12.5px', color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    📁 فتح مجلد الشهر في Drive
                  </a>
                )}
              </div>

              <button
                type="button"
                className="btn btn-start"
                style={{ fontSize: '13px', padding: '6px 16px' }}
                onClick={() => setPreviewAttachmentModal(null)}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
