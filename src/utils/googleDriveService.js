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
 * Optimize image base64 if oversized before sending to Google Drive
 */
async function ensureOptimizedImageBase64(content) {
  if (!content || typeof content !== 'string') return content;
  if (!content.startsWith('data:image/') || content.length < 350000) {
    return content;
  }
  try {
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        const maxDim = 1400;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => resolve(content);
      img.src = content;
    });
  } catch {
    return content;
  }
}

/**
 * Upload a single file (base64) to Google Drive
 */
export async function uploadFileToDrive({ folderId, fileName, mimeType, base64Content, driveConfig }) {
  if (!driveConfig || !driveConfig.serviceUrl) {
    throw new Error('Google Drive service is not configured');
  }

  let cleanBase64 = base64Content || '';

  // Auto-compress large images if passed as raw base64 dataURL
  if (cleanBase64.startsWith('data:image/')) {
    cleanBase64 = await ensureOptimizedImageBase64(cleanBase64);
  }

  // Clean base64 header if present (e.g. data:image/png;base64,...)
  if (cleanBase64.indexOf(';base64,') !== -1) {
    cleanBase64 = cleanBase64.split(';base64,')[1];
  }
  cleanBase64 = cleanBase64.trim();

  // Validate and resolve accurate MIME type
  let resolvedMime = mimeType || 'application/octet-stream';
  if (resolvedMime === 'image' || resolvedMime === 'pdf' || resolvedMime.indexOf('/') === -1) {
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.pdf')) resolvedMime = 'application/pdf';
    else if (lower.endsWith('.png')) resolvedMime = 'image/png';
    else if (lower.endsWith('.doc')) resolvedMime = 'application/msword';
    else resolvedMime = 'image/jpeg';
  }

  const payload = {
    action: 'upload_file',
    folderId,
    fileName,
    mimeType: resolvedMime,
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
      downloadUrl: data.downloadUrl || data.webContentLink || '',
      fileName: data.fileName || fileName
    };
  }

  throw new Error(data?.error || 'فشل رفع الملف إلى Google Drive');
}

/**
 * Generate formatted Microsoft Word Document (.doc) of Employee Personnel Dossier
 * Compatible with Microsoft Word, Google Docs, and LibreOffice with full RTL Arabic support
 */
export function generateEmployeeSummaryWord(emp, orgSettings = {}) {
  const branches = emp.branchesDetails || [];
  const orgName = orgSettings.orgName || 'مجموعة الصيدليات الطبية';
  const logoUrl = orgSettings.logoUrl || '';
  const gmName = orgSettings.generalManagerName || 'المدير العام';

  const phonesList = Array.isArray(emp.phones) && emp.phones.length > 0 
    ? emp.phones.map(p => p.number).filter(Boolean).join(' - ')
    : (emp.phone || '—');

  const primaryBranchName = emp.branchName || 
    (branches.length > 0 ? (branches[0].branchName || `فرع ${branches[0].branchId}`) : 'الفرع الرئيسي');

  const totalSalary = Number(emp.salary || 0) + 
                      Number(emp.managementAllowance || 0) + 
                      Number(emp.transportAllowance || 0) + 
                      Number(emp.extraAllowance || 0);

  const docCode = `HR-${emp.code || 'EMP'}-${new Date().getFullYear()}`;
  const generationDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const generationTime = new Date().toLocaleTimeString('ar-EG');

  return `
<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns:v='urn:schemas-microsoft-com:vml'
      xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word 15">
<meta name="Originator" content="Microsoft Word 15">
<title>ملف الموظف الشامل — ${emp.name || ''}</title>
<!--[if gte mso 9]>
<xml>
 <w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
  <w:DoNotOptimizeForBrowser/>
 </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page WordSection1 {
    size: 595.3pt 841.9pt; /* A4 Standard */
    margin: 2.0cm 1.8cm 2.0cm 1.8cm;
    mso-header-margin: 35.4pt;
    mso-footer-margin: 35.4pt;
    mso-paper-source: 0;
  }
  div.WordSection1 { page: WordSection1; }
  body {
    font-family: 'Segoe UI', 'Arial', Tahoma, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    direction: rtl;
    text-align: right;
    color: #1e293b;
    background-color: #ffffff;
    margin: 0;
    padding: 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin-top: 4pt;
    margin-bottom: 12pt;
    font-size: 10pt;
  }
  th {
    background-color: #0f766e;
    color: #ffffff;
    font-weight: bold;
    padding: 7pt 9pt;
    border: 1pt solid #0d9488;
    text-align: right;
  }
  td {
    padding: 6pt 9pt;
    border: 1pt solid #cbd5e1;
    text-align: right;
    vertical-align: middle;
  }
  .header-table {
    border: none;
    margin-bottom: 14pt;
    border-bottom: 2.5pt solid #0f766e;
    padding-bottom: 10pt;
  }
  .header-table td {
    border: none;
    background: transparent !important;
  }
  .section-title {
    background-color: #f0fdfa;
    border-right: 4.5pt solid #0f766e;
    border-top: 1pt solid #ccfbf1;
    border-bottom: 1pt solid #ccfbf1;
    border-left: 1pt solid #ccfbf1;
    padding: 6pt 10pt;
    font-size: 11.5pt;
    font-weight: bold;
    color: #0f766e;
    margin-top: 12pt;
    margin-bottom: 4pt;
  }
  .lbl {
    width: 22%;
    background-color: #f8fafc !important;
    font-weight: bold;
    color: #475569;
    border: 1pt solid #cbd5e1;
  }
  .val {
    width: 28%;
    color: #0f172a;
    border: 1pt solid #cbd5e1;
  }
  .highlight-row {
    background-color: #f0fdfa !important;
  }
  .badge-tag {
    display: inline-block;
    padding: 2pt 8pt;
    border-radius: 4pt;
    font-weight: bold;
    font-size: 8.5pt;
  }
  .badge-active {
    background-color: #dcfce7;
    color: #166534;
  }
  .signatures-table {
    border: none;
    margin-top: 24pt;
  }
  .signatures-table td {
    border: 1pt dashed #cbd5e1;
    background-color: #fbfcfe !important;
    text-align: center;
    padding: 10pt 8pt;
    vertical-align: top;
    font-size: 9.5pt;
  }
</style>
</head>
<body lang="AR-EG" dir="RTL">
<div class="WordSection1">

  <!-- ── Header Table ── -->
  <table class="header-table" dir="rtl">
    <tr>
      <td style="width: 65%; vertical-align: middle;">
        <div style="font-size: 16pt; font-weight: 800; color: #0f766e;">🏥 ${orgName}</div>
        <div style="font-size: 11.5pt; font-weight: bold; color: #334155; margin-top: 3pt;">إدارة الموارد البشرية وشؤون العاملين</div>
        <div style="font-size: 9.5pt; color: #64748b; margin-top: 2pt;">وثيقة بيان حالة وملف موظف رسمي معتمد (HR Personnel Dossier)</div>
      </td>
      <td style="width: 35%; text-align: left; vertical-align: middle;">
        ${logoUrl ? `<img src="${logoUrl}" style="max-height: 50pt; max-width: 140pt; object-fit: contain;" /><br/>` : ''}
        <div style="font-size: 8.5pt; color: #64748b; margin-top: 4pt;">رقم الوثيقة: <strong>${docCode}</strong></div>
        <div style="font-size: 8.5pt; color: #64748b;">تاريخ التحديث: <strong>${generationDate}</strong></div>
      </td>
    </tr>
  </table>

  <!-- ── 1. Personal & Contact Info ── -->
  <div class="section-title">👤 أولاً: البيانات الشخصية والتعريفية للموظف</div>
  <table dir="rtl">
    <tr>
      <td class="lbl">الاسم الكامل:</td>
      <td class="val" style="font-weight: bold; color: #0f766e; font-size: 11pt;">${emp.name || '—'}</td>
      <td class="lbl">كود الموظف:</td>
      <td class="val" style="font-weight: bold;">${emp.code || '—'}</td>
    </tr>
    <tr>
      <td class="lbl">الرقم القومي (14 رقم):</td>
      <td class="val" style="font-weight: bold; letter-spacing: 0.5pt;">${emp.nationalId || '—'}</td>
      <td class="lbl">اللقب والشهرة:</td>
      <td class="val">${emp.nickname || '—'}</td>
    </tr>
    <tr>
      <td class="lbl">رقم الهاتف الأساسي:</td>
      <td class="val">${phonesList}</td>
      <td class="lbl">هاتف الطوارئ / الأقارب:</td>
      <td class="val">${emp.relativePhone || emp.emergencyPhone || '—'}</td>
    </tr>
    <tr>
      <td class="lbl">تاريخ الميلاد:</td>
      <td class="val">${emp.dob || '—'}</td>
      <td class="lbl">الحالة الاجتماعية:</td>
      <td class="val">${emp.maritalStatus || 'أعزب'}</td>
    </tr>
    <tr>
      <td class="lbl">البريد الإلكتروني:</td>
      <td class="val">${emp.email || '—'}</td>
      <td class="lbl">العنوان ومحل الإقامة:</td>
      <td class="val">${emp.address || '—'}</td>
    </tr>
  </table>

  <!-- ── 2. Employment & Job Details ── -->
  <div class="section-title">💼 ثانياً: البيانات الوظيفية والتعاقدية</div>
  <table dir="rtl">
    <tr>
      <td class="lbl">المسمى الوظيفي:</td>
      <td class="val" style="font-weight: bold; color: #0f766e;">${emp.jobTitle || 'موظف'}</td>
      <td class="lbl">القسم / الإدارة:</td>
      <td class="val">${emp.department || 'الصيدلية'}</td>
    </tr>
    <tr>
      <td class="lbl">الفرع الأساسي التابع له:</td>
      <td class="val" style="font-weight: bold;">${primaryBranchName}</td>
      <td class="lbl">تاريخ بداية التعيين:</td>
      <td class="val">${emp.hireDate || emp.createdAt || '—'}</td>
    </tr>
    <tr>
      <td class="lbl">نوع التعاقد:</td>
      <td class="val">${emp.contractType || 'دوام كامل'}</td>
      <td class="lbl">حالة الموظف بالعمل:</td>
      <td class="val"><span class="badge-tag badge-active">${emp.status || 'على رأس العمل'}</span></td>
    </tr>
    <tr>
      <td class="lbl">رصيد الإجازات السنوية:</td>
      <td class="val"><strong>${emp.annualLeaveBalance !== undefined ? emp.annualLeaveBalance : 21}</strong> يوم</td>
      <td class="lbl">حالة البصمة الحيوية:</td>
      <td class="val">${emp.fingerprint_active !== false ? 'مفعلة بالنظام ✅' : 'معطلة مؤقتاً ❌'}</td>
    </tr>
  </table>

  <!-- ── 3. Financial Package & Compensation ── -->
  <div class="section-title">💰 ثالثاً: الحزمة المالية وتفاصيل الراتب والبدلات</div>
  <table dir="rtl">
    <tr>
      <td class="lbl">الراتب الأساسي الشهري:</td>
      <td class="val" style="font-weight: bold; color: #0f766e; font-size: 11pt;">${fmt(emp.salary)} ج.م</td>
      <td class="lbl">بدل الإدارة والإشراف:</td>
      <td class="val">${fmt(emp.managementAllowance || 0)} ج.م</td>
    </tr>
    <tr>
      <td class="lbl">بدل الانتقال والمواصلات:</td>
      <td class="val">${fmt(emp.transportAllowance || 0)} ج.م</td>
      <td class="lbl">بدلات إضافية مخصصة:</td>
      <td class="val">${fmt(emp.extraAllowance || 0)} ج.م ${emp.extraAllowanceTitle ? `(${emp.extraAllowanceTitle})` : ''}</td>
    </tr>
    <tr class="highlight-row">
      <td class="lbl" style="font-weight: bold; color: #0f766e; font-size: 10.5pt;">إجمالي الاستحقاق الشهري:</td>
      <td class="val" colspan="3" style="font-weight: 800; font-size: 11.5pt; color: #0f766e;">
        ${fmt(totalSalary)} جنيهاً مصرياً فقط لا غير
      </td>
    </tr>
  </table>

  <!-- ── 4. Branch Allocation & Working Hours ── -->
  <div class="section-title">🏢 رابعاً: جدول توزيع الفروع ومواعيد وساعات العمل</div>
  ${branches.length > 0 ? `
  <table dir="rtl">
    <thead>
      <tr>
        <th style="width: 30%;">اسم الفرع</th>
        <th style="width: 20%;">الراتب المخصص بالفرع</th>
        <th style="width: 16%;">ساعات العمل / اليوم</th>
        <th style="width: 16%;">أيام العمل / الشهر</th>
        <th style="width: 18%;">ساعات الراحة (بريك)</th>
      </tr>
    </thead>
    <tbody>
      ${branches.map(b => `
        <tr>
          <td style="font-weight: bold; color: #0f766e;">${b.branchName || b.branchId || 'الفرع الرئيسي'}</td>
          <td style="font-weight: bold;">${fmt(b.salary)} ج.م</td>
          <td>${b.workHours || b.workHoursPerDay || 8} ساعة</td>
          <td>${b.workDays || b.workDaysPerMonth || 26} يوم</td>
          <td>${b.breakHours || b.defaultBreakHours || 0} ساعة</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : `
  <table dir="rtl">
    <tr>
      <td class="lbl">ساعات العمل اليومية:</td>
      <td class="val"><strong>${emp.workHoursPerDay || 8}</strong> ساعة / يوم</td>
      <td class="lbl">أيام العمل الشهرية:</td>
      <td class="val"><strong>${emp.workDaysPerMonth || 26}</strong> يوم / شهر</td>
    </tr>
  </table>
  `}

  <!-- ── 5. Official Documents ── -->
  <div class="section-title">📁 خامساً: سجل مسوغات التعيين والمستندات الرسمية الموثقة</div>
  <table dir="rtl">
    <thead>
      <tr>
        <th style="width: 8%;">#</th>
        <th style="width: 44%;">اسم المستند / المسوغ الرسمي</th>
        <th style="width: 22%;">نوع الملف المرفق</th>
        <th style="width: 26%;">حالة التوثيق في Google Drive</th>
      </tr>
    </thead>
    <tbody>
      ${(emp.documents && emp.documents.length > 0) ? emp.documents.map((doc, idx) => `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td style="font-weight: bold;">${doc.title || doc.type || `مستند ${idx + 1}`}</td>
          <td>${doc.fileType?.includes('pdf') ? 'ملف PDF إلكتروني' : 'صورة ضوئية رقمية'}</td>
          <td style="color: ${doc.driveFileId ? '#166534' : '#b45309'}; font-weight: bold;">
            ${doc.driveFileId ? 'موثق ومرفوع سحابياً ✅' : (doc.fileUrl ? 'مرفق محلياً بالنظام' : 'غير مكتمل ⚠️')}
          </td>
        </tr>
      `).join('') : `
        <tr>
          <td colspan="4" style="text-align: center; color: #64748b; padding: 10pt;">لا توجد مستندات مسجلة حالياً بملف الموظف</td>
        </tr>
      `}
    </tbody>
  </table>

  <!-- ── 6. Official Signatures & Endorsements ── -->
  <table class="signatures-table" dir="rtl">
    <tr>
      <td style="width: 25%;">
        <strong>إقرار الموظف</strong><br/><br/>
        أقر أنا الموظف المذكور أعلاه بصحة كافة البيانات الواردة في هذا الملف.<br/><br/><br/>
        <strong>التوقيع:</strong> ....................................
      </td>
      <td style="width: 25%;">
        <strong>مسؤول شؤون العاملين (HR)</strong><br/><br/>
        تمت المراجعة والتدقيق والمطابقة مع المستندات الأصلية.<br/><br/><br/>
        <strong>التوقيع:</strong> ....................................
      </td>
      <td style="width: 25%;">
        <strong>الإدارة المالية والرواتب</strong><br/><br/>
        تم اعتماد الأجر التعاقدي والبدلات المقررة وفق اللائحة.<br/><br/><br/>
        <strong>التوقيع:</strong> ....................................
      </td>
      <td style="width: 25%;">
        <strong>اعتماد الإدارة العامة</strong><br/><br/>
        يعتمد رسمياً ويوثق في الأرشيف السحابي.<br/><br/>
        <strong>المدير العام:</strong> ${gmName}<br/>
        <strong>الختم الرسمي:</strong> ........................
      </td>
    </tr>
  </table>

  <div style="margin-top: 18pt; border-top: 1pt solid #cbd5e1; padding-top: 6pt; font-size: 8.5pt; color: #94a3b8; text-align: center;">
    تم إنشاء هذه الوثيقة وتحديثها آلياً بواسطة ${orgName} · توثيق رقمي سحابي: ${generationDate} الساعة ${generationTime}
  </div>

</div>
</body>
</html>
  `;
}

// Alias for backwards compatibility
export const generateEmployeeSummaryHTML = generateEmployeeSummaryWord;

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

    // 2. Generate and upload Employee Summary Document in Microsoft Word (.doc) format
    onProgress('جاري توليد ورفع وثيقة بيانات الموظف بصيغة Word (DOC)...');
    const summaryDocContent = generateEmployeeSummaryWord(emp, orgSettings);
    const summaryBase64 = btoa(unescape(encodeURIComponent(summaryDocContent)));
    
    await uploadFileToDrive({
      folderId: empFolderId,
      fileName: `ملخص_بيانات_الموظف_${emp.code || 'EMP'}.doc`,
      mimeType: 'application/msword',
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
        if (doc.fileUrl && !doc.driveFileId) {
          onProgress(`جاري رفع مستند (${doc.title || doc.type || `مستند ${i + 1}`})...`);
          try {
            // Determine accurate MIME type and extension from dataURL / fileName
            let mimeType = 'image/jpeg';
            let ext = 'jpg';

            if (doc.fileUrl.startsWith('data:')) {
              const mimeMatch = doc.fileUrl.match(/^data:([^;]+);base64,/);
              if (mimeMatch && mimeMatch[1]) {
                mimeType = mimeMatch[1].toLowerCase();
                if (mimeType.includes('pdf')) ext = 'pdf';
                else if (mimeType.includes('png')) ext = 'png';
                else if (mimeType.includes('webp')) ext = 'webp';
                else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
              }
            } else if (doc.fileType?.includes('pdf') || doc.fileName?.toLowerCase().endsWith('.pdf')) {
              mimeType = 'application/pdf';
              ext = 'pdf';
            } else if (doc.fileName?.toLowerCase().endsWith('.png')) {
              mimeType = 'image/png';
              ext = 'png';
            }

            const cleanTitle = (doc.title || doc.type || `مستند_${i + 1}`).replace(/[\/\\?%*:|"<>]/g, '_');
            const uploadRes = await uploadFileToDrive({
              folderId: empFolderId,
              fileName: `${cleanTitle}.${ext}`,
              mimeType,
              base64Content: doc.fileUrl,
              driveConfig
            });

            if (uploadRes && (uploadRes.fileId || uploadRes.fileUrl)) {
              updatedDocuments[i] = {
                ...doc,
                driveFileId: uploadRes.fileId,
                driveViewLink: uploadRes.fileUrl,
                driveDownloadUrl: uploadRes.downloadUrl
              };
            }
          } catch (docErr) {
            console.error(`Failed to upload doc ${doc.title} to drive:`, docErr);
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

/**
 * Upload Biometric Attendance Photo to Employee's Drive Folder
 * Saved in the employee's '📸 صور البصمة الإلكترونية' subfolder
 */
export async function uploadBiometricAttendancePhoto({ employee, photoDataUrl, actionType, driveConfig }) {
  if (!driveConfig || !driveConfig.serviceUrl || !photoDataUrl) {
    return { success: false, error: 'خدمة Google Drive غير مهيأة أو صورة البصمة مفقودة' };
  }

  try {
    let targetFolderId = employee?.biometricFolderId;

    if (!targetFolderId) {
      // Create or get employee folder structure
      const folderRes = await createOrGetEmployeeFolder(employee, driveConfig);
      if (folderRes && (folderRes.biometricFolderId || folderRes.folderId)) {
        targetFolderId = folderRes.biometricFolderId || folderRes.folderId;
      }
    }

    if (!targetFolderId) {
      throw new Error('تعذر العثور على مجلد البصمة الخاص بالموظف في Google Drive');
    }

    const actionNames = {
      shift_start: 'بداية_دوام',
      shift_end: 'نهاية_دوام',
      break_start: 'بدء_استراحة',
      break_end: 'انتهاء_استراحة'
    };
    const actionLabel = actionNames[actionType] || actionType || 'حضور';
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const fileName = `بصمة_حضور_${actionLabel}_${employee.code || 'EMP'}_${dateStr}_${timeStr}.jpg`;

    const uploadRes = await uploadFileToDrive({
      folderId: targetFolderId,
      fileName,
      mimeType: 'image/jpeg',
      base64Content: photoDataUrl,
      driveConfig
    });

    return {
      success: true,
      fileId: uploadRes.fileId,
      fileUrl: uploadRes.fileUrl,
      downloadUrl: uploadRes.downloadUrl,
      fileName
    };
  } catch (err) {
    console.warn('[GoogleDriveService] Failed to upload biometric attendance photo:', err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Create or Get Expenses Folder and Month Subfolder in Google Drive
 * Structure: [Parent] ➔ 📁 مصروفات ➔ 📁 YYYY-MM
 */
export async function createOrGetExpensesMonthFolder(monthStr, driveConfig) {
  if (!driveConfig || !driveConfig.serviceUrl) {
    throw new Error('Google Drive service is not configured');
  }

  const targetMonth = monthStr || new Date().toISOString().slice(0, 7);

  // 1. Attempt direct action 'create_or_get_expenses_folder'
  try {
    const res = await fetch(driveConfig.serviceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'create_or_get_expenses_folder',
        parentFolderId: driveConfig.parentFolderId || '',
        month: targetMonth
      })
    });
    const data = await res.json();
    if (data && (data.success || data.folderId)) {
      return {
        expensesFolderId: data.expensesFolderId,
        expensesFolderUrl: data.expensesFolderUrl,
        folderId: data.folderId,
        folderName: data.folderName,
        folderUrl: data.folderUrl || `https://drive.google.com/drive/folders/${data.folderId}`
      };
    }
  } catch (err) {
    console.warn('[GoogleDriveService] Direct create_or_get_expenses_folder failed, trying fallback...', err);
  }

  // 2. Seamless Fallback (works even if Google Apps Script has not yet been redeployed)
  // Step A: Create or get 'مصروفات' folder under root
  const rootExpensesRes = await fetch(driveConfig.serviceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'create_or_get_employee_folder',
      parentFolderId: driveConfig.parentFolderId || '',
      folderName: 'مصروفات'
    })
  });
  const rootData = await rootExpensesRes.json();
  const expensesFolderId = rootData?.folderId;
  if (!expensesFolderId) {
    throw new Error(rootData?.error || 'تعذر إنشاء مجلد مصروفات في جوجل درايف');
  }

  // Step B: Create or get month folder under 'مصروفات'
  const monthRes = await fetch(driveConfig.serviceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'create_or_get_employee_folder',
      parentFolderId: expensesFolderId,
      folderName: targetMonth
    })
  });
  const monthData = await monthRes.json();
  if (monthData && (monthData.success || monthData.folderId)) {
    return {
      expensesFolderId: expensesFolderId,
      expensesFolderUrl: rootData.folderUrl || `https://drive.google.com/drive/folders/${expensesFolderId}`,
      folderId: monthData.folderId,
      folderName: targetMonth,
      folderUrl: monthData.folderUrl || `https://drive.google.com/drive/folders/${monthData.folderId}`
    };
  }

  throw new Error(monthData?.error || 'تعذر إنشاء مجلد الشهر في جوجل درايف');
}

/**
 * Generate formatted attachment filename: [اسم_الفاتورة]_[الفرع]_[التاريخ].[الامتداد]
 */
export function generateExpenseAttachmentFileName({
  category = '',
  branchName = '',
  dateStr = '',
  originalFileName = '',
  mimeType = ''
}) {
  const cleanCat = (category || 'فاتورة').trim().replace(/[\\/:*?"<>|\s]+/g, '_');
  const cleanBranch = (branchName || 'الفرع').trim().replace(/[\\/:*?"<>|\s]+/g, '_');
  const cleanDate = (dateStr || new Date().toISOString().slice(0, 10)).trim();

  let ext = 'jpg';
  if (originalFileName && originalFileName.includes('.')) {
    ext = originalFileName.split('.').pop().toLowerCase();
  } else if (mimeType === 'application/pdf') {
    ext = 'pdf';
  } else if (mimeType === 'image/png') {
    ext = 'png';
  } else if (mimeType === 'image/webp') {
    ext = 'webp';
  }

  return `${cleanCat}_${cleanBranch}_${cleanDate}.${ext}`;
}

/**
 * Upload Expense / Revenue Attachment to Google Drive
 */
export async function uploadExpenseAttachmentToDrive({
  fileContent,
  fileName,
  mimeType,
  monthStr,
  type = 'expense',
  category = '',
  branchName = '',
  dateStr = '',
  driveConfig,
  onProgress = () => {}
}) {
  if (!driveConfig || !driveConfig.enabled || !driveConfig.serviceUrl) {
    return { success: false, reason: 'خدمة Google Drive غير مفعلة' };
  }

  onProgress('جاري الاتصال بمجلد مصروفات في Google Drive...');
  const folderInfo = await createOrGetExpensesMonthFolder(monthStr, driveConfig);

  const cleanExt = (fileName && fileName.includes('.'))
    ? fileName.split('.').pop().toLowerCase()
    : (mimeType === 'application/pdf' ? 'pdf' : 'jpg');
  const sanitizedCat = (category || 'فاتورة').trim().replace(/[\\/:*?"<>|\s]+/g, '_');
  const sanitizedBranch = (branchName || 'الفرع').trim().replace(/[\\/:*?"<>|\s]+/g, '_');
  const cleanDate = (dateStr || monthStr || new Date().toISOString().slice(0, 10)).trim();

  // اسم الملف بصيغة: [اسم_الفاتورة]_[الفرع]_[التاريخ].[الامتداد]
  const customFileName = (fileName && fileName.includes('.'))
    ? fileName
    : `${sanitizedCat}_${sanitizedBranch}_${cleanDate}.${cleanExt}`;

  onProgress('جاري رفع الفاتورة/المستند إلى مجلد الشهر في Google Drive...');
  const uploadRes = await uploadFileToDrive({
    folderId: folderInfo.folderId,
    fileName: customFileName,
    mimeType: mimeType || 'application/octet-stream',
    base64Content: fileContent,
    driveConfig
  });

  return {
    success: true,
    fileId: uploadRes.fileId,
    fileUrl: uploadRes.fileUrl,
    webViewLink: uploadRes.webViewLink || uploadRes.fileUrl,
    downloadUrl: uploadRes.downloadUrl,
    fileName: uploadRes.fileName || customFileName,
    monthFolderId: folderInfo.folderId,
    monthFolderUrl: folderInfo.folderUrl,
    expensesFolderUrl: folderInfo.expensesFolderUrl
  };
}

