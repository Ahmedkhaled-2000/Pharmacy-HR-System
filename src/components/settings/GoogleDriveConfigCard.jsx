import React, { useState, useEffect } from 'react';
import {
  testGoogleDriveConnection,
  uploadSystemBackupToDrive,
  saveDriveScheduleToBackend,
  fetchDriveScheduleFromBackend
} from '../../utils/googleDriveService';

export default function GoogleDriveConfigCard({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard,
  ownerLocks
}) {
  const orgSettings = state.orgSettings || {};
  const currentDriveConfig = orgSettings.driveConfig || {};

  const [enabled, setEnabled] = useState(currentDriveConfig.enabled || false);
  const [autoSyncOnEmployeeSave, setAutoSyncOnEmployeeSave] = useState(
    currentDriveConfig.autoSyncOnEmployeeSave !== undefined ? currentDriveConfig.autoSyncOnEmployeeSave : true
  );
  const [serviceUrl, setServiceUrl] = useState(currentDriveConfig.serviceUrl || '');
  const [parentFolderId, setParentFolderId] = useState(currentDriveConfig.parentFolderId || '');

  // إعدادات النسخ الاحتياطي التلقائي المجدول
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(
    currentDriveConfig.autoBackupEnabled !== undefined ? currentDriveConfig.autoBackupEnabled : true
  );
  const [autoBackupTime, setAutoBackupTime] = useState(currentDriveConfig.autoBackupTime || '03:00');
  const [retentionCount, setRetentionCount] = useState(currentDriveConfig.retentionCount || 20);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success, message, folderUrl }
  const [isInstantBackingUp, setIsInstantBackingUp] = useState(false);
  const [instantBackupResult, setInstantBackupResult] = useState(null);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const cfg = (state.orgSettings || {}).driveConfig || {};
    setEnabled(cfg.enabled || false);
    setAutoSyncOnEmployeeSave(cfg.autoSyncOnEmployeeSave !== undefined ? cfg.autoSyncOnEmployeeSave : true);
    setServiceUrl(cfg.serviceUrl || '');
    setParentFolderId(cfg.parentFolderId || '');
    setAutoBackupEnabled(cfg.autoBackupEnabled !== undefined ? cfg.autoBackupEnabled : true);
    setAutoBackupTime(cfg.autoBackupTime || '03:00');
    setRetentionCount(cfg.retentionCount || 20);
  }, [state.orgSettings]);

  // مزامنة حالة الجدولة مع السيرفر الخلفي
  useEffect(() => {
    fetchDriveScheduleFromBackend().then(res => {
      if (res && res.success && res.schedule) {
        if (res.schedule.autoBackupEnabled !== undefined) setAutoBackupEnabled(res.schedule.autoBackupEnabled);
        if (res.schedule.autoBackupTime) setAutoBackupTime(res.schedule.autoBackupTime);
        if (res.schedule.retentionCount) setRetentionCount(res.schedule.retentionCount);
      }
    }).catch(() => {});
  }, []);

  const handleTest = async () => {
    if (!serviceUrl.trim()) {
      showToast?.('⚠️ يرجى إدخال رابط خدمة Google Drive (Webhook URL) أولاً');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    const res = await testGoogleDriveConnection({
      serviceUrl: serviceUrl.trim(),
      parentFolderId: parentFolderId.trim()
    });

    setIsTesting(false);
    setTestResult(res);

    if (res.success) {
      showToast?.('✅ تم الاتصال بحساب Google Drive بنجاح');
    } else {
      showToast?.('❌ ' + (res.error || 'تعذر الاتصال بـ Google Drive'));
    }
  };

  const handleInstantBackup = async () => {
    if (!serviceUrl.trim()) {
      showToast?.('⚠️ يرجى إدخال رابط خدمة Google Drive وحفظ الإعدادات أولاً');
      return;
    }

    setIsInstantBackingUp(true);
    setInstantBackupResult(null);
    showToast?.('⏳ جاري رفع نسخة احتياطية فورية إلى Google Drive...');

    try {
      const res = await uploadSystemBackupToDrive(state, {
        serviceUrl: serviceUrl.trim(),
        parentFolderId: parentFolderId.trim(),
        retentionCount: parseInt(retentionCount, 10) || 20
      }, (msg) => {
        showToast?.(msg);
      });

      setInstantBackupResult(res);
      if (res.success) {
        showToast?.('🎉 تم حفظ النسخة بنجاح على Google Drive!');
      } else {
        showToast?.('❌ فشل الرفع: ' + (res.error || 'خطأ غير معروف'));
      }
    } catch (err) {
      showToast?.('❌ خطأ: ' + (err.message || err));
    } finally {
      setIsInstantBackingUp(false);
    }
  };

  const handleSave = async () => {
    const updatedDriveConfig = {
      enabled,
      autoSyncOnEmployeeSave,
      serviceUrl: serviceUrl.trim(),
      parentFolderId: parentFolderId.trim(),
      autoBackupEnabled,
      autoBackupTime: autoBackupTime || '03:00',
      retentionCount: parseInt(retentionCount, 10) || 20,
      lastAutoBackupAt: currentDriveConfig.lastAutoBackupAt || '',
      lastScheduledBackupDate: currentDriveConfig.lastScheduledBackupDate || '',
      lastCheckedAt: new Date().toISOString()
    };

    const performSave = async () => {
      try {
        localStorage.setItem('pharmacy_drive_config', JSON.stringify(updatedDriveConfig));
      } catch (e) {}

      const updatedOrgSettings = {
        ...orgSettings,
        driveConfig: updatedDriveConfig
      };
      const updatedState = {
        ...state,
        orgSettings: updatedOrgSettings
      };
      setState(updatedState);
      await saveState(updatedState);

      // حفظ الجدولة في السيرفر الخلفي لمواصلة العمل 24/7
      try {
        await saveDriveScheduleToBackend({
          autoBackupEnabled,
          autoBackupTime: autoBackupTime || '03:00',
          retentionCount: parseInt(retentionCount, 10) || 20
        });
      } catch (backendErr) {
        console.warn('[Drive Schedule Save Warn]:', backendErr.message);
      }

      showToast?.('💾 تم حفظ إعدادات Google Drive وجدولة النسخ التلقائي بنجاح');
    };

    if (executeWithOwnerGuard && (ownerLocks?.lockEditDriveConfig || state.orgSettings?.ownerModificationLocks?.lockEditDriveConfig || state.orgSettings?.ownerModificationLocks?.lockEditOrgSettings)) {
      executeWithOwnerGuard({
        lockKey: 'lockEditDriveConfig',
        actionTitle: 'تعديل إعدادات Google Drive والمزامنة السحابية',
        actionDetails: 'تحديث رابط خدمة المزامنة السحابية وجدولة النسخ التلقائي',
        onExecute: performSave
      });
      return;
    }

    await performSave();
  };

  const scriptCode = `/**
 * 📁 كود Google Apps Script لمزامنة ملفات الموظفين والنسخ الاحتياطي التلقائي مع Google Drive
 * الإصدار المتطور v2.0 - يدعم الرفع التلقائي بدون أخطاء CORS وتدوير النسخ وحفظ الفواتير
 * قم بلصقه في https://script.google.com/ وانشره كتطبيق ويب (Web app).
 */
function doGet(e) {
  return createJsonResponse({
    success: true,
    status: 'ok',
    message: 'Google Apps Script HR & Drive Backup Integration is running successfully!',
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ success: false, error: 'No post data received' });
    }
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    if (action === 'test') {
      var rootFolder = getOrCreateRootFolder(data.parentFolderId);
      return createJsonResponse({
        success: true,
        folderId: rootFolder.getId(),
        folderName: rootFolder.getName(),
        folderUrl: rootFolder.getUrl()
      });
    } else if (action === 'create_or_get_employee_folder') {
      return handleEmployeeFolder(data);
    } else if (action === 'create_or_get_folder' || action === 'create_or_get_expenses_folder') {
      return handleGenericFolder(data);
    } else if (action === 'create_or_get_backups_folder') {
      var bFolder = getOrCreateBackupsFolder(data.parentFolderId);
      return createJsonResponse({
        success: true,
        folderId: bFolder.getId(),
        folderName: bFolder.getName(),
        folderUrl: bFolder.getUrl()
      });
    } else if (action === 'upload_file') {
      return handleUploadFile(data);
    } else if (action === 'upload_system_backup') {
      return handleSystemBackupUpload(data);
    } else if (action === 'list_system_backups') {
      return handleListSystemBackups(data);
    } else {
      return createJsonResponse({ success: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function getOrCreateRootFolder(parentFolderId) {
  if (parentFolderId && parentFolderId.trim() !== '') {
    try {
      return DriveApp.getFolderById(parentFolderId.trim());
    } catch(e) {}
  }
  var folders = DriveApp.getFoldersByName('HR_Employees_Archive');
  if (folders.hasNext()) return folders.next();
  var f = DriveApp.createFolder('HR_Employees_Archive');
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}
  return f;
}

function getOrCreateBackupsFolder(parentFolderId) {
  var parent = null;
  if (parentFolderId && parentFolderId.trim() !== '') {
    try { parent = DriveApp.getFolderById(parentFolderId.trim()); } catch(e){}
  }
  var folderName = '💾 النسخ الاحتياطية للمنظومة';
  var search = parent ? parent.getFoldersByName(folderName) : DriveApp.getFoldersByName(folderName);
  var target;
  if (search.hasNext()) {
    target = search.next();
  } else {
    target = parent ? parent.createFolder(folderName) : DriveApp.createFolder(folderName);
  }
  try { target.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}
  return target;
}

function handleSystemBackupUpload(data) {
  try {
    var folder = getOrCreateBackupsFolder(data.parentFolderId);
    var fileName = data.fileName || ('Backup_' + Utilities.formatDate(new Date(), 'GMT+2', 'yyyy-MM-dd_HH-mm') + '.json');
    var backupContent = data.backupJson;
    if (!backupContent && data.base64Data) {
      var b64 = data.base64Data;
      if (b64.indexOf(';base64,') !== -1) b64 = b64.split(';base64,')[1];
      backupContent = Utilities.newBlob(Utilities.base64Decode(b64), 'application/json').getDataAsString();
    }
    if (!backupContent) {
      return createJsonResponse({ success: false, error: 'محتوى النسخة الاحتياطية فارغ' });
    }

    var blob = Utilities.newBlob(backupContent, 'application/json', fileName);
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}

    // تدوير وحذف النسخ القديمة الزائدة عن الحد المحدد لتوفير المساحة
    var retentionLimit = parseInt(data.retentionLimit, 10) || 20;
    var fileList = [];
    var filesIter = folder.getFiles();
    while (filesIter.hasNext()) {
      var f = filesIter.next();
      if (!f.isTrashed()) {
        fileList.push({
          file: f,
          created: f.getDateCreated().getTime()
        });
      }
    }
    fileList.sort(function(a, b) { return b.created - a.created; });
    var purgedCount = 0;
    if (fileList.length > retentionLimit) {
      for (var i = retentionLimit; i < fileList.length; i++) {
        fileList[i].file.setTrashed(true);
        purgedCount++;
      }
    }

    var downloadUrl = 'https://drive.google.com/uc?export=download&id=' + file.getId();
    return createJsonResponse({
      success: true,
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: file.getUrl(),
      downloadUrl: downloadUrl,
      folderUrl: folder.getUrl(),
      purgedOldBackups: purgedCount,
      message: 'تم حفظ النسخة الاحتياطية بنجاح على Google Drive'
    });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function handleListSystemBackups(data) {
  try {
    var folder = getOrCreateBackupsFolder(data.parentFolderId);
    var fileList = [];
    var filesIter = folder.getFiles();
    while (filesIter.hasNext()) {
      var f = filesIter.next();
      if (!f.isTrashed()) {
        fileList.push({
          id: f.getId(),
          name: f.getName(),
          size: f.getSize(),
          created: f.getDateCreated().toISOString(),
          url: f.getUrl(),
          downloadUrl: 'https://drive.google.com/uc?export=download&id=' + f.getId()
        });
      }
    }
    fileList.sort(function(a, b) {
      return new Date(b.created).getTime() - new Date(a.created).getTime();
    });

    return createJsonResponse({
      success: true,
      backups: fileList,
      folderUrl: folder.getUrl()
    });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function handleGenericFolder(data) {
  var parentFolder = null;
  if (data.parentFolderId && data.parentFolderId.trim() !== '') {
    try { parentFolder = DriveApp.getFolderById(data.parentFolderId.trim()); } catch(e){}
  }
  if (!parentFolder) parentFolder = getOrCreateRootFolder();
  var folderName = data.folderName || data.month || 'مجلد_عام';
  var search = parentFolder.getFoldersByName(folderName);
  var targetFolder = search.hasNext() ? search.next() : parentFolder.createFolder(folderName);
  try { targetFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}
  return createJsonResponse({
    success: true,
    folderId: targetFolder.getId(),
    folderName: targetFolder.getName(),
    folderUrl: targetFolder.getUrl()
  });
}

function handleEmployeeFolder(data) {
  var root = getOrCreateRootFolder(data.parentFolderId);
  var folderName = data.folderName || 'EMP_' + data.employeeCode;
  var empFolder = null;
  if (data.existingFolderId) {
    try { empFolder = DriveApp.getFolderById(data.existingFolderId); } catch(e){}
  }
  if (!empFolder) {
    var search = root.getFoldersByName(folderName);
    if (search.hasNext()) empFolder = search.next();
    else {
      empFolder = root.createFolder(folderName);
      try { empFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}
    }
  }

  var isNotEmployee = data.isNotEmployee === true || data.folderType === 'expenses' || folderName === 'مصروفات' || /^\\d{4}-\\d{2}$/.test(folderName);
  var bioFolder = null;
  if (!isNotEmployee && (data.employeeCode || data.employeeId || data.createBiometricSubfolder !== false)) {
    var bioSub = '📸 صور البصمة الإلكترونية';
    var bioSearch = empFolder.getFoldersByName(bioSub);
    bioFolder = bioSearch.hasNext() ? bioSearch.next() : empFolder.createFolder(bioSub);
    try { bioFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}
  }

  return createJsonResponse({
    success: true,
    folderId: empFolder.getId(),
    folderName: empFolder.getName(),
    folderUrl: empFolder.getUrl(),
    biometricFolderId: bioFolder ? bioFolder.getId() : '',
    biometricFolderUrl: bioFolder ? bioFolder.getUrl() : ''
  });
}

function handleUploadFile(data) {
  try {
    var folder = DriveApp.getFolderById(data.folderId);
    var base64Data = data.base64Data || '';
    if (base64Data.indexOf(';base64,') !== -1) base64Data = base64Data.split(';base64,')[1];
    base64Data = base64Data.trim();
    var mimeType = data.mimeType || 'application/octet-stream';
    var fName = data.fileName || ('File_' + Date.now());
    if (!mimeType || mimeType === 'image' || mimeType === 'pdf' || mimeType.indexOf('/') === -1) {
      var lower = fName.toLowerCase();
      if (lower.indexOf('.pdf') !== -1) mimeType = 'application/pdf';
      else if (lower.indexOf('.png') !== -1) mimeType = 'image/png';
      else if (lower.indexOf('.doc') !== -1) mimeType = 'application/msword';
      else mimeType = 'image/jpeg';
    }
    var bytes;
    try {
      bytes = Utilities.base64Decode(base64Data);
    } catch (e) {
      bytes = Utilities.base64Decode(base64Data.replace(/[^A-Za-z0-9+/=]/g, ''));
    }
    var blob = Utilities.newBlob(bytes, mimeType, fName);
    if (fName.indexOf('ملخص_بيانات_الموظف') !== -1) {
      var allFiles = folder.getFiles();
      while (allFiles.hasNext()) {
        var cf = allFiles.next();
        var cfName = cf.getName();
        if (cfName.indexOf('ملخص_بيانات_الموظف') !== -1 || cfName === fName) cf.setTrashed(true);
      }
    } else {
      var exist = folder.getFilesByName(fName);
      while (exist.hasNext()) exist.next().setTrashed(true);
    }
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}
    return createJsonResponse({ success: true, fileId: file.getId(), fileName: file.getName(), fileUrl: file.getUrl() });
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}`;

  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(scriptCode);
    setIsCopied(true);
    showToast?.('📋 تم نسخ الكود بنجاح إلى الحافظة');
    setTimeout(() => setIsCopied(false), 3000);
  };

  return (
    <div className="card-box" style={{ marginTop: '24px', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', background: 'var(--surface)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #4285F4 0%, #34A853 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            boxShadow: '0 4px 12px rgba(66, 133, 244, 0.25)'
          }}>
            ☁️
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text)' }}>
              تكامل وأرشفة Google Drive والنسخ الاحتياطي التلقائي المجدول
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
              حفظ النسخ الاحتياطية سحابياً تلقائياً، وأرشفة ملفات ومستندات وبصمات الموظفين والفواتير
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowScriptModal(true)}
            style={{ fontSize: '13px', padding: '8px 14px', border: '1px solid var(--border)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            📋 كود سكربت الربط المحدث (Apps Script)
          </button>
        </div>
      </div>

      {/* Switches Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px', marginBottom: '20px' }}>
        {/* Enable Switch */}
        <div style={{
          background: 'var(--bg-card, rgba(255,255,255,0.05))',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text)' }}>تفعيل تكامل Google Drive</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>تشغيل خدمات الأرشفة والنسخ السحابي</div>
          </div>
          <label className="switch" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="slider round"></span>
          </label>
        </div>

        {/* Auto Sync on Employee Save Switch */}
        <div style={{
          background: 'var(--bg-card, rgba(255,255,255,0.05))',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text)' }}>مزامنة ملفات الموظفين تلقائياً</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>رفع المستندات وصور البصمة فور الحفظ</div>
          </div>
          <label className="switch" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoSyncOnEmployeeSave}
              onChange={(e) => setAutoSyncOnEmployeeSave(e.target.checked)}
              disabled={!enabled}
            />
            <span className="slider round"></span>
          </label>
        </div>
      </div>

      {/* Connection Inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', opacity: enabled ? 1 : 0.6 }}>
        {/* Service Webhook URL */}
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: 'var(--text)' }}>
            رابط تطبيق الويب لخدمة Google Drive (Apps Script Web App URL) <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            type="url"
            value={serviceUrl}
            onChange={(e) => setServiceUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            disabled={!enabled}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: '13.5px',
              direction: 'ltr',
              textAlign: 'left'
            }}
          />
          <span style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
            احصل على هذا الرابط بعد نشر سكربت Google Apps Script (اضغط زر "كود سكربت الربط" بأعلى الشاشة للخطوات السهلة).
          </span>
        </div>

        {/* Parent Root Folder ID */}
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: 'var(--text)' }}>
            معرف المجلد الرئيسي على Google Drive (Parent Folder ID) <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--muted)' }}>(اختياري)</span>
          </label>
          <input
            type="text"
            value={parentFolderId}
            onChange={(e) => setParentFolderId(e.target.value)}
            placeholder="مثال: 1a2B3c4D5e6F7g8H9i... (إذا تُرِك فارغاً فسيتم إنشاء مجلد باسم HR_Employees_Archive تلقائياً)"
            disabled={!enabled}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: '13.5px',
              direction: 'ltr',
              textAlign: 'left'
            }}
          />
        </div>

        {/* Test Result Display */}
        {testResult && (
          <div style={{
            padding: '14px 18px',
            borderRadius: '12px',
            background: testResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${testResult.success ? '#22c55e' : '#ef4444'}`,
            color: testResult.success ? '#15803d' : '#b91c1c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div>
              <strong>{testResult.success ? '✅ نجح الاتصال:' : '❌ فشل الاتصال:'}</strong> {testResult.message || testResult.error}
              {testResult.folderName && (
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  المجلد النشط: <strong>{testResult.folderName}</strong>
                </div>
              )}
            </div>
            {testResult.folderUrl && (
              <a
                href={testResult.folderUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost"
                style={{ fontSize: '12px', color: '#0284c7', textDecoration: 'underline' }}
              >
                📂 فتح المجلد في Google Drive
              </a>
            )}
          </div>
        )}

        {/* ── Scheduled Auto-Backup Section (النسخ الاحتياطي التلقائي المجدول) ── */}
        <div style={{
          marginTop: '10px',
          background: 'var(--surface-muted, rgba(2, 132, 199, 0.04))',
          border: '1px solid rgba(2, 132, 199, 0.25)',
          borderRadius: '14px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '22px' }}>⏰</span>
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--text)', fontWeight: 'bold' }}>
                  النسخ الاحتياطي السحابي اليومي المجدول (Daily 24/7 VPS Auto-Backup)
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                  يقوم خادم المنظومة بأخذ لقطة كاملة لقاعدة البيانات ورفعها إلى Google Drive تلقائياً في الموعد المحدد
                </p>
              </div>
            </div>

            <label className="switch" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={(e) => setAutoBackupEnabled(e.target.checked)}
                disabled={!enabled}
              />
              <span className="slider round"></span>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', opacity: (enabled && autoBackupEnabled) ? 1 : 0.6 }}>
            {/* Time Picker */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: 'var(--text)' }}>
                🕒 موعد النسخ اليومي المحدد (بتوقيت مصر)
              </label>
              <input
                type="time"
                value={autoBackupTime}
                onChange={(e) => setAutoBackupTime(e.target.value)}
                disabled={!enabled || !autoBackupEnabled}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              />
              <span style={{ fontSize: '11.5px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                الموعد الموصى به: 03:00 ص أو 04:00 ص لتفادي أوقات الذروة.
              </span>
            </div>

            {/* Retention Limit */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: 'var(--text)' }}>
                🔢 حد الاحتفاظ بالنسخ (Retention Limit)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={retentionCount}
                onChange={(e) => setRetentionCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={!enabled || !autoBackupEnabled}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              />
              <span style={{ fontSize: '11.5px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                حفظ أحدث {retentionCount} نسخة مع تدوير وحذف النسخ الأقدم لتوفير سعة Google Drive.
              </span>
            </div>
          </div>

          {/* Status Indicator */}
          <div style={{ marginTop: '14px', padding: '12px 14px', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '12.5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: (enabled && autoBackupEnabled) ? '#22c55e' : '#94a3b8' }}></span>
              <span>
                الحالة: <strong>{(enabled && autoBackupEnabled) ? `نشط - موعد النسخ اليومي: الساعة ${autoBackupTime}` : 'متوقف'}</strong>
              </span>
            </div>

            {currentDriveConfig.lastAutoBackupAt && (
              <span style={{ color: 'var(--muted)' }}>
                آخر نسخة تلقائية: {new Date(currentDriveConfig.lastAutoBackupAt).toLocaleString('ar-EG')}
              </span>
            )}
          </div>
        </div>

        {/* Instant Backup Result Alert */}
        {instantBackupResult && (
          <div style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: instantBackupResult.success ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${instantBackupResult.success ? '#86efac' : '#fca5a5'}`,
            color: instantBackupResult.success ? '#166534' : '#991b1b',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <span>
              {instantBackupResult.success
                ? `🎉 ${instantBackupResult.message} (${instantBackupResult.fileName})`
                : `❌ ${instantBackupResult.error}`}
            </span>
            {instantBackupResult.downloadUrl && (
              <a
                href={instantBackupResult.downloadUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#0284c7', fontWeight: 'bold' }}
              >
                📥 تنزيل الملف من Drive
              </a>
            )}
          </div>
        )}

        {/* Actions Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleTest}
            disabled={!enabled || isTesting}
            style={{ padding: '10px 18px', fontSize: '13px', fontWeight: 'bold' }}
          >
            {isTesting ? '🔄 جاري فحص الاتصال...' : '🔍 فحص الاتصال بـ Drive'}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleInstantBackup}
            disabled={!enabled || !serviceUrl.trim() || isInstantBackingUp}
            style={{ padding: '10px 18px', fontSize: '13px', fontWeight: 'bold', border: '1px solid #0284c7', color: '#0284c7' }}
          >
            {isInstantBackingUp ? '⏳ جاري الرفع...' : '☁️ تجربة أخذ نسخة فورية الآن'}
          </button>

          <button
            type="button"
            className="btn btn-start"
            onClick={handleSave}
            style={{ padding: '10px 24px', fontSize: '13.5px', fontWeight: 'bold' }}
          >
            💾 حفظ الإعدادات والجدولة
          </button>
        </div>
      </div>

      {/* Script & Setup Modal */}
      {showScriptModal && (
        <div className="modal-overlay" onClick={() => setShowScriptModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '820px' }}>
            <div className="badge-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>☁️</span>
                <h3 style={{ margin: 0 }}>تحديث كود Google Apps Script للإصدار الجديد v2.0</h3>
              </div>
              <button className="close-btn" onClick={() => setShowScriptModal(false)}>✕</button>
            </div>

            <div className="badge-body" style={{ textAlign: 'right', maxHeight: '72vh', overflowY: 'auto' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '16px', borderRadius: '12px', marginBottom: '18px' }}>
                <h4 style={{ margin: '0 0 10px', color: '#1d4ed8', fontSize: '15px' }}>📌 خطوات التحديث السريعة (في دقيقة واحدة):</h4>
                <ol style={{ margin: 0, paddingRight: '20px', lineHeight: 1.8, fontSize: '13.5px' }}>
                  <li>افتح مشروعك في <a href="https://script.google.com/home" target="_blank" rel="noreferrer" style={{ color: '#0284c7', fontWeight: 'bold' }}>Google Apps Script</a>.</li>
                  <li>امسح الكود القديم كاملاً، واضغط على زر <strong>"نسخ الكود بالكامل"</strong> بالأسفل والصقه بدلاً منه.</li>
                  <li>اضغط على زر <strong>حفظ 💾 (Save project)</strong>.</li>
                  <li>اضغط على زر <strong>"نشر" (Deploy)</strong> بالأعلى ثم اختر <strong>"إدارة عمليات النشر" (Manage deployments)</strong>.</li>
                  <li>اضغط على أيقونة القلم ✏️ (تعديل)، واختر من قائمة <i>"الإصدار" (Version)</i>: <strong>"إصدار جديد" (New version)</strong> ثم اضغط <strong>"نشر" (Deploy)</strong>.</li>
                  <li>بهذه الخطوة سيتم تحديث الخدمة فوراً لدعم النسخ التلقائي وبنفس الرابط دون الحاجة لتغييره!</li>
                </ol>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px' }}>كود السكربت الجديد المحدث:</span>
                <button
                  type="button"
                  className="btn btn-start"
                  onClick={copyScriptToClipboard}
                  style={{ padding: '6px 16px', fontSize: '12.5px' }}
                >
                  {isCopied ? '✅ تم النسخ!' : '📋 نسخ الكود بالكامل'}
                </button>
              </div>

              <pre style={{
                background: '#0f172a',
                color: '#38bdf8',
                padding: '16px',
                borderRadius: '10px',
                fontSize: '12px',
                lineHeight: 1.5,
                overflowX: 'auto',
                direction: 'ltr',
                textAlign: 'left',
                maxHeight: '300px'
              }}>
                {scriptCode}
              </pre>
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowScriptModal(false)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
