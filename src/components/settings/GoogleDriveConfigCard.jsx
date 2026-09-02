import React, { useState, useEffect } from 'react';
import { testGoogleDriveConnection } from '../../utils/googleDriveService';

export default function GoogleDriveConfigCard({
  state,
  setState,
  saveState,
  showToast,
  executeWithOwnerGuard
}) {
  const orgSettings = state.orgSettings || {};
  const currentDriveConfig = orgSettings.driveConfig || {};

  const [enabled, setEnabled] = useState(currentDriveConfig.enabled || false);
  const [autoSyncOnEmployeeSave, setAutoSyncOnEmployeeSave] = useState(
    currentDriveConfig.autoSyncOnEmployeeSave !== undefined ? currentDriveConfig.autoSyncOnEmployeeSave : true
  );
  const [serviceUrl, setServiceUrl] = useState(currentDriveConfig.serviceUrl || '');
  const [parentFolderId, setParentFolderId] = useState(currentDriveConfig.parentFolderId || '');

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success, message, folderUrl }
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const cfg = (state.orgSettings || {}).driveConfig || {};
    setEnabled(cfg.enabled || false);
    setAutoSyncOnEmployeeSave(cfg.autoSyncOnEmployeeSave !== undefined ? cfg.autoSyncOnEmployeeSave : true);
    setServiceUrl(cfg.serviceUrl || '');
    setParentFolderId(cfg.parentFolderId || '');
  }, [state.orgSettings]);

  const handleTest = async () => {
    if (!serviceUrl.trim()) {
      showToast('⚠️ يرجى إدخال رابط خدمة Google Drive (Webhook URL) أولاً');
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
      showToast('✅ تم الاتصال بحساب Google Drive بنجاح');
    } else {
      showToast('❌ تعذر الاتصال بـ Google Drive');
    }
  };

  const handleSave = async () => {
    const updatedDriveConfig = {
      enabled,
      autoSyncOnEmployeeSave,
      serviceUrl: serviceUrl.trim(),
      parentFolderId: parentFolderId.trim(),
      lastCheckedAt: new Date().toISOString()
    };

    const performSave = async () => {
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
      showToast('💾 تم حفظ إعدادات Google Drive بنجاح');
    };

    if (executeWithOwnerGuard && state.orgSettings?.ownerModificationLocks?.lockEditOrgSettings) {
      executeWithOwnerGuard({
        lockKey: 'lockEditOrgSettings',
        actionTitle: 'تعديل إعدادات Google Drive',
        actionDetails: 'تحديث رابط خدمة المزامنة السحابية لمجلدات الموظفين',
        onExecute: performSave
      });
      return;
    }

    await performSave();
  };

  const scriptCode = `/**
 * 📁 كود Google Apps Script لمزامنة ملفات الموظفين مع Google Drive
 * قم بلصقه في https://script.google.com/ وانشره كتطبيق ويب (Web app).
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    if (action === 'test') {
      var rootFolder = getOrCreateRootFolder(data.parentFolderId);
      return createJsonResponse({ success: true, folderId: rootFolder.getId(), folderName: rootFolder.getName(), folderUrl: rootFolder.getUrl() });
    } else if (action === 'create_or_get_employee_folder') {
      return handleEmployeeFolder(data);
    } else if (action === 'upload_file') {
      return handleUploadFile(data);
    }
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function getOrCreateRootFolder(parentFolderId) {
  if (parentFolderId && parentFolderId.trim() !== '') {
    return DriveApp.getFolderById(parentFolderId.trim());
  }
  var folders = DriveApp.getFoldersByName('HR_Employees_Archive');
  if (folders.hasNext()) return folders.next();
  var f = DriveApp.createFolder('HR_Employees_Archive');
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return f;
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
      empFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
  }
  var bioSub = '📸 صور البصمة الإلكترونية';
  var bioSearch = empFolder.getFoldersByName(bioSub);
  var bioFolder = bioSearch.hasNext() ? bioSearch.next() : empFolder.createFolder(bioSub);
  bioFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return createJsonResponse({
    success: true,
    folderId: empFolder.getId(),
    folderName: empFolder.getName(),
    folderUrl: empFolder.getUrl(),
    biometricFolderId: bioFolder.getId(),
    biometricFolderUrl: bioFolder.getUrl()
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
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
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
    showToast('📋 تم نسخ الكود بنجاح إلى الحافظة');
    setTimeout(() => setIsCopied(false), 3000);
  };

  return (
    <div className="card-box" style={{ marginTop: '24px', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
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
            📁
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text)' }}>
              تكامل وأرشفة ملفات الموظفين على Google Drive
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
              إنشاء مجلد تلقائي باسم وكود الموظف، رفع المستندات وبطاقة البيانات، ومجلد فرعي لصور البصمة
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowScriptModal(true)}
            style={{ fontSize: '13px', padding: '8px 14px', border: '1px solid var(--border)', borderRadius: '10px' }}
          >
            📋 كود سكربت الربط (Apps Script)
          </button>
        </div>
      </div>

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
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>تشغيل خدمة الأرشفة السحابية التلقائية للموظفين</div>
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

        {/* Auto Sync on Save Switch */}
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
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text)' }}>المزامنة التلقائية عند حفظ الموظف</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>إنشاء المجلد ورفع المستندات وصور البصمة فور الحفظ</div>
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
            justifyContent: 'space-between'
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

        {/* Actions Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleTest}
            disabled={!enabled || isTesting}
            style={{ padding: '10px 20px', fontSize: '13.5px', fontWeight: 'bold' }}
          >
            {isTesting ? '🔄 جاري فحص الاتصال...' : '🔍 فحص الاتصال بـ Google Drive'}
          </button>

          <button
            type="button"
            className="btn btn-start"
            onClick={handleSave}
            style={{ padding: '10px 24px', fontSize: '13.5px', fontWeight: 'bold' }}
          >
            💾 حفظ إعدادات Drive
          </button>
        </div>
      </div>

      {/* Script & Setup Modal */}
      {showScriptModal && (
        <div className="modal-overlay" onClick={() => setShowScriptModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '780px' }}>
            <div className="badge-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>☁️</span>
                <h3 style={{ margin: 0 }}>طريقة تفعيل Google Drive مع المنظومة في دقيقة واحدة</h3>
              </div>
              <button className="close-btn" onClick={() => setShowScriptModal(false)}>✕</button>
            </div>

            <div className="badge-body" style={{ textAlign: 'right', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '16px', borderRadius: '12px', marginBottom: '18px' }}>
                <h4 style={{ margin: '0 0 10px', color: '#1d4ed8', fontSize: '15px' }}>📌 خطوات الإعداد البسيطة:</h4>
                <ol style={{ margin: 0, paddingRight: '20px', lineHeight: 1.8, fontSize: '13.5px' }}>
                  <li>افتح الرابط: <a href="https://script.google.com/home/start" target="_blank" rel="noreferrer" style={{ color: '#0284c7', fontWeight: 'bold' }}>Google Apps Script</a> بحساب الجيميل الخاص بك.</li>
                  <li>اضغط على <strong>"مشروع جديد" (New project)</strong>.</li>
                  <li>امسح أي كود موجود، واضغط على زر <strong>"نسخ الكود"</strong> بالأسفل والصقه في المحرر.</li>
                  <li>اضغط على زر <strong>"نشر" (Deploy)</strong> بالأعلى ثم اختر <strong>"نشر جديد" (New deployment)</strong>.</li>
                  <li>اضغط على أيقونة الترس ⚙️ واختر <strong>"تطبيق ويب" (Web app)</strong>.</li>
                  <li>في حقل <i>"من يمكنه الوصول" (Who has access)</i> اختر: <strong>"أي مستخدم" (Anyone)</strong>.</li>
                  <li>اضغط <strong>"نشر" (Deploy)</strong> وامنح الأذونات لحسابك (Authorize Access).</li>
                  <li>انسخ رابط <strong>"عنوان URL لتطبيق الويب" (Web app URL)</strong> والصقه في حقل الإعدادات أعلاه!</li>
                </ol>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '13px' }}>كود السكربت الجاهز:</span>
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
                maxHeight: '260px'
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
