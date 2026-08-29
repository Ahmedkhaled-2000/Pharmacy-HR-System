// ─────────────────────────────────────────────────────────────
//  Google Drive Automated Cloud Integration Service
// ─────────────────────────────────────────────────────────────

import { fmt, arabicWeekday } from './formatters';

/**
 * Test Google Drive Webhook or Service Account Connection
 */
export async function testGoogleDriveConnection(driveConfig) {
  if (!driveConfig || !driveConfig.serviceUrl) {
    return { success: false, error: 'يرجى إدخال رابط خدمة Google Drive (Apps Script Webhook URL)' };
  }

  try {
    const res = await fetch(driveConfig.serviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'test',
        parentFolderId: driveConfig.parentFolderId || ''
      })
    });

    const data = await res.json();
    if (data && (data.success || data.status === 'ok')) {
      return {
        success: true,
        folderName: data.folderName || 'المجلد الرئيسي',
        folderUrl: data.folderUrl || '',
        message: 'تم الاتصال بحساب Google Drive بنجاح ✅'
      };
    }
    return { success: false, error: data?.error || 'تعذر الاتصال بـ Google Drive' };
  } catch (err) {
    console.error('Google Drive Connection Test Error:', err);
    return { success: false, error: `فشل الاتصال: ${err.message || 'خطأ في الشبكة'}` };
  }
}

/**
 * Create or Get Employee Folder in Google Drive
 */
export async function createOrGetEmployeeFolder(emp, driveConfig) {
  if (!driveConfig || !driveConfig.serviceUrl) {
    throw new Error('Google Drive service is not configured');
  }

  const folderName = `${emp.code || 'EMP'} - ${emp.name || 'موظف'}`;

  const payload = {
    action: 'create_or_get_employee_folder',
    parentFolderId: driveConfig.parentFolderId || '',
    folderName: folderName,
    employeeId: String(emp.id || ''),
    employeeCode: String(emp.code || ''),
    existingFolderId: emp.driveFolderId || ''
  };

  const res = await fetch(driveConfig.serviceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data && (data.success || data.folderId)) {
    return {
      folderId: data.folderId,
      folderUrl: data.folderUrl || `https://drive.google.com/drive/folders/${data.folderId}`,
      biometricFolderId: data.biometricFolderId || '',
      biometricFolderUrl: data.biometricFolderUrl || ''
    };
  }

  throw new Error(data?.error || 'فشل إنشاء مجلد الموظف في Google Drive');
}

/**
 * Upload a single file (base64) to Google Drive
 */
export async function uploadFileToDrive({ folderId, fileName, mimeType, base64Content, driveConfig }) {
  if (!driveConfig || !driveConfig.serviceUrl) {
    throw new Error('Google Drive service is not configured');
  }

  // Clean base64 header if present (e.g. data:image/png;base64,...)
  let cleanBase64 = base64Content || '';
  if (cleanBase64.includes(';base64,')) {
    cleanBase64 = cleanBase64.split(';base64,')[1];
  }

  const payload = {
    action: 'upload_file',
    folderId,
    fileName,
    mimeType: mimeType || 'application/octet-stream',
    base64Data: cleanBase64
  };

  const res = await fetch(driveConfig.serviceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data && (data.success || data.fileId)) {
    return {
      fileId: data.fileId,
      fileUrl: data.fileUrl || data.webViewLink || `https://drive.google.com/file/d/${data.fileId}/view`,
      downloadUrl: data.webContentLink || '',
      fileName: data.fileName || fileName
    };
  }

  throw new Error(data?.error || 'فشل رفع الملف إلى Google Drive');
}

/**
 * Generate formatted HTML document of Employee Profile
 */
export function generateEmployeeSummaryHTML(emp, orgSettings = {}) {
  const branches = emp.branchesDetails || [];
  const orgName = orgSettings.orgName || 'مجموعة الصيدليات الطبية';
  const logoUrl = orgSettings.logoUrl || '';

  const phonesList = Array.isArray(emp.phones) && emp.phones.length > 0 
    ? emp.phones.map(p => p.number).filter(Boolean).join(' - ')
    : (emp.phone || '—');

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>ملف الموظف الشامل — ${emp.name}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f8fafc; color: #1e293b; padding: 24px; direction: rtl; }
    .card { max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #0d9488, #0f766e); color: #ffffff; padding: 24px; display: flex; align-items: center; justify-content: space-between; }
    .header h1 { margin: 0 0 6px; font-size: 22px; }
    .header p { margin: 0; opacity: 0.9; font-size: 14px; }
    .section { padding: 20px 24px; border-bottom: 1px solid #f1f5f9; }
    .section-title { font-size: 16px; font-weight: bold; color: #0f766e; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .field { background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; }
    .label { font-size: 12px; color: #64748b; margin-bottom: 4px; }
    .value { font-size: 14px; font-weight: 600; color: #0f172a; }
    .table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .table th { background: #f1f5f9; padding: 8px 10px; font-size: 12px; text-align: right; border: 1px solid #e2e8f0; }
    .table td { padding: 8px 10px; font-size: 13px; border: 1px solid #e2e8f0; text-align: right; }
    .footer { background: #f8fafc; padding: 14px 24px; font-size: 12px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div>
        <h1>${emp.name}</h1>
        <p>كود الموظف: ${emp.code} · ${emp.jobTitle || 'موظف'} · ${emp.department || 'الصيدلية'}</p>
      </div>
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height: 48px; max-width: 140px; background: white; padding: 4px 8px; border-radius: 8px;" />` : ''}
    </div>

    <div class="section">
      <div class="section-title">👤 البيانات الشخصية والاتصال</div>
      <div class="grid">
        <div class="field"><div class="label">الاسم الكامل</div><div class="value">${emp.name}</div></div>
        <div class="field"><div class="label">اللقب والشهرة</div><div class="value">${emp.nickname || '—'}</div></div>
        <div class="field"><div class="label">أرقام الهواتف</div><div class="value">${phonesList}</div></div>
        <div class="field"><div class="label">هاتف الطوارئ / الأقارب</div><div class="value">${emp.relativePhone || emp.emergencyPhone || '—'}</div></div>
        <div class="field"><div class="label">الرقم القومي</div><div class="value">${emp.nationalId || '—'}</div></div>
        <div class="field"><div class="label">البريد الإلكتروني</div><div class="value">${emp.email || '—'}</div></div>
        <div class="field"><div class="label">تاريخ الميلاد</div><div class="value">${emp.dob || '—'}</div></div>
        <div class="field"><div class="label">الحالة الاجتماعية</div><div class="value">${emp.maritalStatus || 'أعزب'}</div></div>
        <div class="field" style="grid-column: span 2;"><div class="label">العنوان المسجل</div><div class="value">${emp.address || '—'}</div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">💼 البيانات الوظيفية والتعاقد</div>
      <div class="grid">
        <div class="field"><div class="label">المسمى الوظيفي</div><div class="value">${emp.jobTitle}</div></div>
        <div class="field"><div class="label">القسم / الإدارة</div><div class="value">${emp.department || 'الصيدلية'}</div></div>
        <div class="field"><div class="label">نوع التعاقد</div><div class="value">${emp.contractType || 'دوام كامل'}</div></div>
        <div class="field"><div class="label">تاريخ التعيين</div><div class="value">${emp.hireDate || emp.createdAt || '—'}</div></div>
        <div class="field"><div class="label">حالة الموظف</div><div class="value">${emp.status || 'على رأس العمل'}</div></div>
        <div class="field"><div class="label">رصيد الإجازات السنوية</div><div class="value">${emp.annualLeaveBalance || 21} يوم</div></div>
      </div>
    </div>

    ${branches.length > 0 ? `
    <div class="section">
      <div class="section-title">🏢 الفروع وأيام العمل والرواتب</div>
      <table class="table">
        <thead>
          <tr>
            <th>الفرع</th>
            <th>الراتب بالفرع</th>
            <th>ساعات اليوم</th>
            <th>أيام الشهر</th>
            <th>ساعات البريك</th>
          </tr>
        </thead>
        <tbody>
          ${branches.map(b => `
            <tr>
              <td>${b.branchName || b.branchId || 'الفرع الرئيسي'}</td>
              <td>${fmt(b.salary)} ج.م</td>
              <td>${b.workHours || 8} ساعة</td>
              <td>${b.workDays || 26} يوم</td>
              <td>${b.breakHours || 0} ساعة</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="footer">
      تم إنشاء هذه الوثيقة وتوثيقها سحابياً بواسطة ${orgName} في ${new Date().toLocaleString('ar-EG')}
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Synchronize entire employee data, summary doc, official documents, and biometric folder to Google Drive
 */
export async function syncEmployeeEntireDrive(emp, orgSettings = {}, onProgress = () => {}) {
  const driveConfig = orgSettings.driveConfig;
  if (!driveConfig || !driveConfig.enabled || !driveConfig.serviceUrl) {
    return { success: false, reason: 'خدمة Google Drive غير مفعلة في الإعدادات' };
  }

  try {
    onProgress('جاري إنشاء/فحص مجلد الموظف في Google Drive...');
    
    // 1. Create or get employee main folder & biometric subfolder
    const folderRes = await createOrGetEmployeeFolder(emp, driveConfig);
    const empFolderId = folderRes.folderId;
    const empFolderUrl = folderRes.folderUrl;
    const biometricFolderId = folderRes.biometricFolderId;

    // 2. Generate and upload Employee Summary Document
    onProgress('جاري توليد ورفع وثيقة بيانات الموظف الشاملة...');
    const summaryHtml = generateEmployeeSummaryHTML(emp, orgSettings);
    const summaryBase64 = btoa(unescape(encodeURIComponent(summaryHtml)));
    
    await uploadFileToDrive({
      folderId: empFolderId,
      fileName: `ملخص_بيانات_الموظف_${emp.code || 'EMP'}.html`,
      mimeType: 'text/html',
      base64Content: summaryBase64,
      driveConfig
    });

    // 3. Upload Employee Personal Photo to Biometric Folder if exists
    if (emp.photoUrl && emp.photoUrl.startsWith('data:')) {
      onProgress('جاري رفع صورة الموظف والبصمة إلى مجلد البصمات...');
      const targetBioFolder = biometricFolderId || empFolderId;
      try {
        await uploadFileToDrive({
          folderId: targetBioFolder,
          fileName: `صورة_البصمة_الشخصية_${emp.code || 'EMP'}.jpg`,
          mimeType: 'image/jpeg',
          base64Content: emp.photoUrl,
          driveConfig
        });
      } catch (err) {
        console.warn('Failed to upload personal photo to drive:', err);
      }
    }

    // 4. Upload Official Documents (emp.documents)
    const updatedDocuments = [...(emp.documents || [])];
    if (updatedDocuments.length > 0) {
      for (let i = 0; i < updatedDocuments.length; i++) {
        const doc = updatedDocuments[i];
        if (doc.fileUrl && doc.fileUrl.startsWith('data:') && !doc.driveFileId) {
          onProgress(`جاري رفع مستند (${doc.title || doc.type || `مستند ${i + 1}`})...`);
          try {
            const cleanTitle = (doc.title || doc.type || `مستند_${i + 1}`).replace(/[\/\\?%*:|"<>]/g, '_');
            const ext = doc.fileType?.includes('pdf') ? 'pdf' : 'jpg';
            const uploadRes = await uploadFileToDrive({
              folderId: empFolderId,
              fileName: `${cleanTitle}.${ext}`,
              mimeType: doc.fileType || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'),
              base64Content: doc.fileUrl,
              driveConfig
            });

            updatedDocuments[i] = {
              ...doc,
              driveFileId: uploadRes.fileId,
              driveViewLink: uploadRes.fileUrl,
              driveDownloadUrl: uploadRes.downloadUrl
            };
          } catch (docErr) {
            console.warn(`Failed to upload doc ${doc.title} to drive:`, docErr);
          }
        }
      }
    }

    onProgress('تمت المزامنة بنجاح!');

    return {
      success: true,
      updatedEmp: {
        ...emp,
        driveFolderId: empFolderId,
        driveFolderUrl: empFolderUrl,
        biometricFolderId: biometricFolderId || emp.biometricFolderId,
        driveLastSyncAt: new Date().toISOString(),
        documents: updatedDocuments
      },
      driveFolderUrl: empFolderUrl
    };
  } catch (err) {
    console.error('Google Drive Sync Error:', err);
    return { success: false, error: err.message || 'حدث خطأ أثناء المزامنة مع Google Drive' };
  }
}
