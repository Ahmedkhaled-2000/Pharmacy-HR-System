import React, { useState } from 'react';
import { useUI } from '../../context/UIContext';
import { uploadExpenseAttachmentToDrive, generateExpenseAttachmentFileName } from '../../utils/googleDriveService';

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
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'expense' | 'income' | 'pending'
  const [selectedBranch, setSelectedBranch] = useState(currentBranch?.id || '');
  
  // New Entry Form State
  const [type, setType] = useState('expense'); // 'expense' | 'income'
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [branchId, setBranchId] = useState(currentBranch?.id || '');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  // Attachment State
  const [rawFileName, setRawFileName] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentData, setAttachmentData] = useState('');
  const [attachmentType, setAttachmentType] = useState('');
  const [attachmentSize, setAttachmentSize] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [previewAttachmentModal, setPreviewAttachmentModal] = useState(null);
  const [isApprovingId, setIsApprovingId] = useState(null);
  const [adminDirectApprove, setAdminDirectApprove] = useState(true);

  const branches = state.branches || [];
  const transactions = state.finances || state.transactions || [];

  const targetBranchObj = branches.find((b) => b.id === (currentBranch?.id || branchId)) || currentBranch;
  const targetBranchName = targetBranchObj?.name || (isBranchRole ? currentBranch?.name : 'عام');

  // حساب الاسم المنظم للملف فورياً بناءً على ما يُدخله المستخدم: [اسم_الفاتورة]_[الفرع]_[التاريخ].[الامتداد]
  const currentComputedFileName = attachmentData ? generateExpenseAttachmentFileName({
    category: category.trim(),
    branchName: targetBranchName,
    dateStr: date,
    originalFileName: rawFileName || attachmentName,
    mimeType: attachmentType === 'pdf' ? 'application/pdf' : 'image/jpeg'
  }) : '';

  // تصفية الحركات المعلقة
  const pendingTransactions = transactions.filter((t) => t.approvalStatus === 'pending');
  const userPendingList = isBranchRole
    ? pendingTransactions.filter((t) => String(t.branchId) === String(currentBranch?.id))
    : pendingTransactions;
  const pendingCount = userPendingList.length;
  const pendingAmount = userPendingList.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  const filteredList = transactions.filter((t) => {
    if (activeTab === 'pending') {
      if (t.approvalStatus !== 'pending') return false;
    } else if (activeTab !== 'all' && t.type !== activeTab) {
      return false;
    }
    if (filterFn && !filterFn(t.date || (t.createdAt ? t.createdAt.slice(0, 10) : ''))) return false;
    if (isBranchRole) {
      return String(t.branchId) === String(currentBranch?.id);
    }
    if (selectedBranch && String(t.branchId) !== String(selectedBranch)) return false;
    return true;
  });

  // حساب الإجماليات للحركات المعتمدة والنشطة فقط (استبعاد المرفوضة)
  const nonRejectedList = filteredList.filter((t) => t.approvalStatus !== 'rejected');
  const totalIncome = nonRejectedList
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);

  const totalExpenses = nonRejectedList
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
      setRawFileName(file.name);
      setAttachmentType(detectedType);
      const sizeStr = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} ميجابايت`
        : `${Math.round(file.size / 1024)} كيلوبايت`;
      setAttachmentSize(sizeStr);

      const computedName = generateExpenseAttachmentFileName({
        category: category.trim(),
        branchName: targetBranchName,
        dateStr: date,
        originalFileName: file.name,
        mimeType: detectedType === 'pdf' ? 'application/pdf' : 'image/jpeg'
      });
      setAttachmentName(computedName);
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
    setRawFileName('');
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

    // اسم الملف النهائي بصيغة: [اسم_الفاتورة]_[الفرع]_[التاريخ].[الامتداد]
    const finalAttachmentName = attachmentData ? (currentComputedFileName || generateExpenseAttachmentFileName({
      category: category.trim(),
      branchName,
      dateStr: date,
      originalFileName: rawFileName || attachmentName,
      mimeType: attachmentType === 'pdf' ? 'application/pdf' : 'image/jpeg'
    })) : null;

    const driveConfig = state?.orgSettings?.driveConfig;
    const isDriveActive = driveConfig && driveConfig.enabled && driveConfig.serviceUrl;

    // ── شرط: لا يتم الرفع إلى Google Drive إلا بعد موافقة الإدارة العليا ──
    // إذا كان المدخل مدير فرع: تكون الحالة pending ولا يُرفع الملف لدرايف مطلقاً في هذه الخطوة
    // إذا كان المدخل الإدارة العليا: يتم الرفع والاعتماد المباشر إذا كان خيار الاعتماد مفعل
    const shouldDirectApprove = !isBranchRole && adminDirectApprove;
    let driveUploadInfo = null;

    if (shouldDirectApprove && attachmentData && isDriveActive) {
      try {
        const monthStr = date.slice(0, 7);
        showToast?.('☁️ جاري رفع الفاتورة إلى Google Drive بمجلد مصروفات / ' + monthStr + '...');
        driveUploadInfo = await uploadExpenseAttachmentToDrive({
          fileContent: attachmentData,
          fileName: finalAttachmentName,
          mimeType: attachmentType === 'pdf' ? 'application/pdf' : 'image/jpeg',
          monthStr,
          type,
          category: category.trim(),
          branchName,
          dateStr: date,
          driveConfig
        });
      } catch (err) {
        console.warn('Failed to upload to Google Drive during admin submit:', err);
        showToast?.('⚠️ تعذر رفع الملف إلى جوجل درايف، تم حفظه محلياً في المنظومة');
      }
    }

    const approvalStatus = shouldDirectApprove ? 'approved' : 'pending';

    const newTransaction = {
      id: `tx_${Date.now()}`,
      type,
      category: category.trim(),
      amount: parsedAmount,
      branchId: targetBranchId,
      branchName: branchName,
      createdBy: isBranchRole ? (currentBranch?.name ? `مدير فرع ${currentBranch.name}` : 'مدير الفرع') : 'admin',
      createdByRole: isBranchRole ? 'branch' : 'admin',
      notes: notes.trim(),
      attachmentName: finalAttachmentName,
      attachmentData: attachmentData || null,
      attachmentType: attachmentType || null,
      attachmentSize: attachmentSize || null,
      approvalStatus, // 'pending' | 'approved' | 'rejected'
      approvedBy: shouldDirectApprove ? 'الإدارة العليا' : null,
      approvedAt: shouldDirectApprove ? new Date().toISOString() : null,
      driveFileId: driveUploadInfo?.fileId || null,
      driveFileUrl: driveUploadInfo?.fileUrl || null,
      driveWebViewLink: driveUploadInfo?.webViewLink || null,
      driveMonthFolderUrl: driveUploadInfo?.monthFolderUrl || null,
      date,
      createdAt: new Date().toISOString()
    };

    // إشعار للإدارة العليا بمراجعة واعتماد الفاتورة
    let updatedNotifs = state.notifications || [];
    if (isBranchRole) {
      const newNotif = {
        id: `notif_fin_${Date.now()}`,
        type: 'financial_alert',
        title: `📑 فاتورة جديدة بانتظار الاعتماد: فرع ${branchName}`,
        message: `قام مدير فرع ${branchName} بإدراج ${type === 'expense' ? 'مصروف' : 'إيراد'} بقيمة ${parsedAmount} ج.م (${category.trim()}) ${attachmentData ? 'مع مرفق فاتورة' : ''}، بانتظار مراجعة واعتماد الإدارة العليا لرفعها إلى Google Drive.`,
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

    if (isBranchRole) {
      showToast?.('✅ تم حفظ الفاتورة بالمنظومة وبانتظار موافقة الإدارة العليا لرفعها إلى Google Drive');
    } else {
      showToast?.(driveUploadInfo ? '✅ تم إضافة البند واعتماده ورفع الفاتورة إلى Google Drive بنجاح!' : '✅ تم إضافة البند وحفظ الحركة المالية بنجاح!');
    }

    setCategory('');
    setAmount('');
    setNotes('');
    setRawFileName('');
    handleRemoveAttachment();
  };

  // ── إجراء موافقة الإدارة العليا ورفع الفاتورة إلى Google Drive ──
  const handleApproveAndUpload = async (tx) => {
    setIsApprovingId(tx.id);
    let driveUploadInfo = null;
    const driveConfig = state?.orgSettings?.driveConfig;
    const isDriveActive = driveConfig && driveConfig.enabled && driveConfig.serviceUrl;

    const formattedFileName = generateExpenseAttachmentFileName({
      category: tx.category,
      branchName: tx.branchName,
      dateStr: tx.date,
      originalFileName: tx.attachmentName,
      mimeType: tx.attachmentType === 'pdf' ? 'application/pdf' : 'image/jpeg'
    });

    if (tx.attachmentData && isDriveActive) {
      try {
        const monthStr = (tx.date || '').slice(0, 7) || new Date().toISOString().slice(0, 7);
        showToast?.(`☁️ جاري رفع الفاتورة (${formattedFileName}) إلى Google Drive بمجلد مصروفات / ${monthStr}...`);
        driveUploadInfo = await uploadExpenseAttachmentToDrive({
          fileContent: tx.attachmentData,
          fileName: formattedFileName,
          mimeType: tx.attachmentType === 'pdf' ? 'application/pdf' : 'image/jpeg',
          monthStr,
          type: tx.type,
          category: tx.category,
          branchName: tx.branchName,
          dateStr: tx.date,
          driveConfig
        });
      } catch (err) {
        console.error('Drive upload failed on approval:', err);
        showToast?.('⚠️ تعذر رفع الملف إلى جوجل درايف، تم اعتماد الحركة محلياً');
      }
    }

    const updated = transactions.map((t) => {
      if (t.id !== tx.id) return t;
      return {
        ...t,
        approvalStatus: 'approved',
        approvedBy: 'الإدارة العليا',
        approvedAt: new Date().toISOString(),
        attachmentName: formattedFileName,
        driveFileId: driveUploadInfo?.fileId || t.driveFileId || null,
        driveFileUrl: driveUploadInfo?.fileUrl || t.driveFileUrl || null,
        driveWebViewLink: driveUploadInfo?.webViewLink || t.driveWebViewLink || null,
        driveMonthFolderUrl: driveUploadInfo?.monthFolderUrl || t.driveMonthFolderUrl || null
      };
    });

    // إشعار الفرع بالموافقة
    const branchNotif = {
      id: `notif_appr_${Date.now()}`,
      type: 'financial_approved',
      title: `✅ تم اعتماد الفاتورة: ${tx.category}`,
      message: `وافقت الإدارة العليا على حركة ${tx.type === 'expense' ? 'المصروف' : 'الإيراد'} "${tx.category}" بمبلغ ${tx.amount} ج.م ${driveUploadInfo ? 'وتم رفع الفاتورة إلى Google Drive بنجاح.' : '.'}`,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'branch',
      branchId: tx.branchId
    };

    const updatedNotifs = [branchNotif, ...(state.notifications || [])];
    const updatedState = { ...state, finances: updated, transactions: updated, notifications: updatedNotifs };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    if (previewAttachmentModal && previewAttachmentModal.id === tx.id) {
      setPreviewAttachmentModal({
        ...previewAttachmentModal,
        approvalStatus: 'approved',
        attachmentName: formattedFileName,
        driveFileUrl: driveUploadInfo?.fileUrl || null,
        driveWebViewLink: driveUploadInfo?.webViewLink || null,
        driveMonthFolderUrl: driveUploadInfo?.monthFolderUrl || null
      });
    }

    setIsApprovingId(null);
    showToast?.(driveUploadInfo
      ? `✅ تم موافقة الإدارة العليا ورفع الفاتورة (${formattedFileName}) إلى Google Drive بنجاح!`
      : '✅ تم اعتماد الحركة المالية بنجاح!');
  };

  // ── إجراء رفض الحركة المالية من قِبل الإدارة العليا ──
  const handleRejectTransaction = async (tx) => {
    const isConfirmed = await showConfirm({
      title: 'رفض الحركة المالية / الفاتورة',
      message: `هل أنت متأكد من رفض حركة "${tx.category}" بقيمة ${tx.amount} ج.م لفرع ${tx.branchName || 'العام'}؟ لن يتم رفع الفاتورة إلى Google Drive.`,
      confirmText: 'تأكيد الرفض',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '❌'
    });
    if (!isConfirmed) return;

    const updated = transactions.map((t) => {
      if (t.id !== tx.id) return t;
      return {
        ...t,
        approvalStatus: 'rejected',
        rejectedBy: 'الإدارة العليا',
        rejectedAt: new Date().toISOString()
      };
    });

    const branchNotif = {
      id: `notif_rej_${Date.now()}`,
      type: 'financial_rejected',
      title: `❌ تم رفض الفاتورة: ${tx.category}`,
      message: `تم رفض حركة ${tx.type === 'expense' ? 'المصروف' : 'الإيراد'} "${tx.category}" بقيمة ${tx.amount} ج.م من قِبل الإدارة العليا.`,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      read: false,
      targetRole: 'branch',
      branchId: tx.branchId
    };

    const updatedNotifs = [branchNotif, ...(state.notifications || [])];
    const updatedState = { ...state, finances: updated, transactions: updated, notifications: updatedNotifs };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    if (previewAttachmentModal && previewAttachmentModal.id === tx.id) {
      setPreviewAttachmentModal({
        ...previewAttachmentModal,
        approvalStatus: 'rejected'
      });
    }

    showToast?.('❌ تم رفض الحركة المالية');
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
              : 'تسجيل وإدارة حركة المصروفات والإيرادات واعتماد الفواتير المرفوعة من الفروع للرفع إلى Google Drive'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
          <button
            className={`btn ${activeTab === 'pending' ? 'btn-start' : 'btn-ghost'}`}
            style={pendingCount > 0 && activeTab !== 'pending' ? { borderColor: '#f59e0b', color: '#b45309', background: '#fffbeb' } : {}}
            onClick={() => setActiveTab('pending')}
          >
            ⏳ بانتظار الاعتماد ({pendingCount})
          </button>
        </div>
      </div>

      {/* Summary Financial Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '16px' }}>
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

      {/* Pending Items Banner */}
      {pendingCount > 0 && activeTab !== 'pending' && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>⏳</span>
            <div>
              <strong style={{ fontSize: '13.5px', color: '#92400e' }}>
                يوجد {pendingCount} حركة مالية بقيمة إجمالية {pendingAmount.toLocaleString()} ج.م بانتظار موافقة الإدارة العليا.
              </strong>
              <div style={{ fontSize: '11.5px', color: '#b45309' }}>
                المرفقات والفواتير لن يتم رفعها إلى Google Drive إلا بعد اعتماد الإدارة العليا لها.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: '12px', background: '#fef3c7', borderColor: '#fde68a', color: '#92400e', fontWeight: 'bold' }}
            onClick={() => setActiveTab('pending')}
          >
            عرض واعتماد الحركات المعلقة ({pendingCount}) 👁️
          </button>
        </div>
      )}

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
            <label>التصنيف / اسم الفاتورة</label>
            <input
              type="text"
              placeholder="مثال: فاتورة كهرباء، إيجار، صيانة..."
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
              {isBranchRole ? (
                <span style={{ fontSize: '11px', color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                  ⏳ يُرفع إلى Google Drive بعد موافقة الإدارة العليا
                </span>
              ) : state?.orgSettings?.driveConfig?.enabled ? (
                <span style={{ fontSize: '11px', color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                  ☁️ رفع إلى Google Drive (مجلد مصروفات / {date ? date.slice(0, 7) : 'الشهر'})
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
                  يتم تغيير اسم الملف تلقائياً إلى [اسم_الفاتورة]_[الفرع]_[التاريخ] ويتم الرفع لدرايف بعد موافقة الإدارة العليا
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
                      style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }}
                    />
                  ) : (
                    <div style={{ width: '50px', height: '50px', borderRadius: '8px', background: '#fee2e2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 'bold' }}>
                      PDF
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📄 اسم الملف المعتمد:</span>
                      <span style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}>{currentComputedFileName || attachmentName}</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '2px' }}>
                      الحجم: {attachmentSize} • النوع: {attachmentType === 'pdf' ? 'مستند PDF' : 'صورة'} • {isBranchRole ? 'بانتظار اعتماد الإدارة العليا للرفع' : 'جاهز للرفع'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => setPreviewAttachmentModal({
                      attachmentName: currentComputedFileName || attachmentName,
                      attachmentData,
                      attachmentType,
                      attachmentSize,
                      category,
                      amount,
                      date,
                      branchName: targetBranchName,
                      approvalStatus: isBranchRole ? 'pending' : 'approved'
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

          {!isBranchRole && attachmentData && (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', color: '#0f766e' }}>
                <input
                  type="checkbox"
                  checked={adminDirectApprove}
                  onChange={(e) => setAdminDirectApprove(e.target.checked)}
                />
                <span>موافقة فورية من الإدارة العليا ورفع الفاتورة إلى Google Drive مباشرة</span>
              </label>
            </div>
          )}

          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-start" disabled={isUploading}>
              💾 {isBranchRole ? 'تسجيل وإرسال للمراجعة والاعتماد' : 'تسجيل وحفظ الحركة المالية'}
            </button>
          </div>
        </form>
      </div>

      {/* Filter and Table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <h4 style={{ margin: 0, fontSize: '16px' }}>
          📋 سجل الحركة المالية {activeTab === 'pending' ? '— الحركات بانتظار الاعتماد' : ''} {isBranchRole ? `(فرع ${currentBranch?.name || ''})` : ''}
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
                  border: t.approvalStatus === 'pending' ? '1.5px solid #f59e0b' : '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.03)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--muted)' }}>#{idx + 1}</span>
                    {t.type === 'income' ? (
                      <span className="badge badge-success" style={{ fontSize: '11px' }}>🟢 إيراد</span>
                    ) : (
                      <span className="badge badge-danger" style={{ fontSize: '11px' }}>🔴 مصروف</span>
                    )}
                    {t.approvalStatus === 'pending' ? (
                      <span className="badge" style={{ fontSize: '10.5px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                        ⏳ بانتظار موافقة الإدارة
                      </span>
                    ) : t.approvalStatus === 'rejected' ? (
                      <span className="badge badge-danger" style={{ fontSize: '10.5px' }}>❌ مرفوض</span>
                    ) : (
                      <span className="badge badge-success" style={{ fontSize: '10.5px' }}>
                        ✅ معتمد {t.driveFileUrl ? '☁️' : ''}
                      </span>
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
                      📎 عرض الفاتورة ({t.attachmentName ? t.attachmentName.split('.').pop().toUpperCase() : 'مرفق'})
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

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: '6px' }}>
                  {!isBranchRole && t.approvalStatus === 'pending' ? (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: '11.5px', color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5', fontWeight: 'bold' }}
                        onClick={() => handleApproveAndUpload(t)}
                        disabled={isApprovingId === t.id}
                      >
                        {isApprovingId === t.id ? '⏳ جاري الرفع...' : '✅ موافقة ورفع لدرايف'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: '11.5px', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                        onClick={() => handleRejectTransaction(t)}
                      >
                        ❌ رفض
                      </button>
                    </div>
                  ) : <div />}

                  <button
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: '11.5px', color: '#dc2626', fontWeight: 'bold', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '6px' }}
                    onClick={() => handleDelete(t.id)}
                  >
                    🗑️ حذف
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
                <th>حالة الاعتماد</th>
                <th>المرفق / الفاتورة</th>
                <th>الملاحظات</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr><td colSpan="10" style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px' }}>لا توجد حركات مالية مسجلة حتى الآن.</td></tr>
              ) : (
                filteredList.map((t, idx) => (
                  <tr key={t.id} style={t.approvalStatus === 'pending' ? { backgroundColor: 'rgba(245, 158, 11, 0.04)' } : {}}>
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
                      {t.approvalStatus === 'pending' ? (
                        <span className="badge" style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                          ⏳ بانتظار موافقة الإدارة
                        </span>
                      ) : t.approvalStatus === 'rejected' ? (
                        <span className="badge badge-danger" style={{ fontSize: '11px' }}>❌ مرفوض</span>
                      ) : (
                        <span className="badge badge-success" style={{ fontSize: '11px' }}>
                          ✅ معتمد {t.driveFileUrl ? '☁️' : ''}
                        </span>
                      )}
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
                          {t.driveWebViewLink ? (
                            <a
                              href={t.driveWebViewLink}
                              target="_blank"
                              rel="noreferrer"
                              title="فتح في Google Drive"
                              style={{ textDecoration: 'none', fontSize: '14px' }}
                            >
                              ☁️
                            </a>
                          ) : (
                            <span title="لم يُرفع لدرايف بعد" style={{ fontSize: '12px', opacity: 0.5 }}>⏳</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '12.5px' }}>{t.notes || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {!isBranchRole && t.approvalStatus === 'pending' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '3px 8px', fontSize: '11.5px', color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5', fontWeight: 'bold' }}
                              onClick={() => handleApproveAndUpload(t)}
                              disabled={isApprovingId === t.id}
                              title="موافقة الإدارة العليا ورفع الفاتورة إلى Google Drive"
                            >
                              {isApprovingId === t.id ? '⏳ جاري الرفع...' : '✅ موافقة ورفع لدرايف'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ padding: '3px 8px', fontSize: '11.5px', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                              onClick={() => handleRejectTransaction(t)}
                              title="رفض الفاتورة"
                            >
                              ❌ رفض
                            </button>
                          </>
                        )}
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--danger)' }}
                          onClick={() => handleDelete(t.id)}
                          title="حذف القيد"
                        >
                          🗑️
                        </button>
                      </div>
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
                <h3 style={{ margin: 0, fontSize: '16px', fontFamily: 'Cairo', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span>📎 معاينة إيصال / فاتورة الحركة المالية</span>
                  {previewAttachmentModal.approvalStatus === 'pending' ? (
                    <span style={{ fontSize: '11px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px' }}>
                      ⏳ بانتظار موافقة الإدارة العليا
                    </span>
                  ) : previewAttachmentModal.approvalStatus === 'rejected' ? (
                    <span style={{ fontSize: '11px', background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '4px' }}>
                      ❌ مرفوضة من الإدارة
                    </span>
                  ) : previewAttachmentModal.driveWebViewLink ? (
                    <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px' }}>
                      ☁️ معتمدة ومحفوظة على Google Drive
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: '4px' }}>
                      ✅ معتمدة محلياً
                    </span>
                  )}
                </h3>
                <div style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span>البيان: <strong>{previewAttachmentModal.category}</strong></span>
                  <span>•</span>
                  <span>الفرع: <strong>{previewAttachmentModal.branchName || 'عام'}</strong></span>
                  <span>•</span>
                  <span>المبلغ: <strong>{previewAttachmentModal.amount ? `${previewAttachmentModal.amount} ج.م` : ''}</strong></span>
                  <span>•</span>
                  <span>التاريخ: <strong>{previewAttachmentModal.date || ''}</strong></span>
                </div>
                {previewAttachmentModal.attachmentName && (
                  <div style={{ marginTop: '4px', fontSize: '11.5px', color: '#0f766e', direction: 'ltr', unicodeBidi: 'plaintext', fontWeight: 'bold' }}>
                    📄 {previewAttachmentModal.attachmentName}
                  </div>
                )}
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
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
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

                {/* Top Management Approval in Modal */}
                {!isBranchRole && previewAttachmentModal.approvalStatus === 'pending' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '12.5px', color: '#059669', borderColor: '#a7f3d0', background: '#ecfdf5', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => handleApproveAndUpload(previewAttachmentModal)}
                      disabled={isApprovingId === previewAttachmentModal.id}
                    >
                      {isApprovingId === previewAttachmentModal.id ? '⏳ جاري الرفع...' : '✅ موافقة الإدارة العليا ورفع لدرايف'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '12.5px', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => handleRejectTransaction(previewAttachmentModal)}
                    >
                      ❌ رفض الفاتورة
                    </button>
                  </>
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
