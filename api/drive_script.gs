/**
 * =========================================================================
 * 📁 سكربت Google Apps Script للربط الآلي مع Google Drive ونظام الموارد البشرية
 * =========================================================================
 * 
 * 📌 خطوات التثبيت في 1 دقيقة:
 * 1. افتح https://script.google.com/home/start وسجّل الدخول بحساب الجيميل الخاص بك.
 * 2. اضغط "مشروع جديد" (New Project).
 * 3. انسخ هذا الكود بالكامل واستبدل به أي كود موجود في المحرر.
 * 4. اضغط زر "نشر" (Deploy) ➔ "نشر جديد" (New deployment).
 * 5. اضغط على أيقونة الترس ⚙️ واختر "تطبيق ويب" (Web app).
 * 6. اضبط الإعدادات التالية:
 *    - الوصف: HR Drive Integration
 *    - تنفيذ التطبيق باسم (Execute as): "أنا" (Me - your email)
 *    - من يمكنه الوصول (Who has access): "أي مستخدم" (Anyone)
 * 7. اضغط "نشر" (Deploy) ووافق على الصلاحيات المطلوبة (Authorize access).
 * 8. انسخ "عنوان URL لتطبيق الويب" (Web App URL) وضعه في إعدادات المنظومة في قسم Google Drive!
 */

function doPost(e) {
  try {
    var rawData = e.postData.contents;
    var data = JSON.parse(rawData);
    var action = data.action;

    if (action === 'test') {
      return handleTestConnection(data);
    } else if (action === 'create_or_get_employee_folder') {
      return handleCreateOrGetEmployeeFolder(data);
    } else if (action === 'create_or_get_expenses_folder') {
      return handleCreateOrGetExpensesFolder(data);
    } else if (action === 'upload_file') {
      return handleUploadFile(data);
    } else {
      return createJsonResponse({ success: false, error: 'إجراء غير معروف: ' + action });
    }
  } catch (err) {
    return createJsonResponse({ success: false, error: err.toString() });
  }
}

function doGet(e) {
  return createJsonResponse({
    success: true,
    status: 'online',
    message: 'خدمة Google Drive للربط مع نظام الموارد البشرية تعمل بكفاءة ✅'
  });
}

/**
 * 1. اختبار الاتصال بالمجلد الرئيسي
 */
function handleTestConnection(data) {
  var parentFolderId = data.parentFolderId;
  var rootFolder;

  if (parentFolderId && parentFolderId.trim() !== '') {
    rootFolder = DriveApp.getFolderById(parentFolderId.trim());
  } else {
    var folders = DriveApp.getFoldersByName('HR_Employees_Archive');
    if (folders.hasNext()) {
      rootFolder = folders.next();
    } else {
      rootFolder = DriveApp.createFolder('HR_Employees_Archive');
      rootFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
  }

  return createJsonResponse({
    success: true,
    folderId: rootFolder.getId(),
    folderName: rootFolder.getName(),
    folderUrl: rootFolder.getUrl()
  });
}

/**
 * 2. إنشاء أو جلب مجلد الموظف والمجلد الفرعي للبصمات
 */
function handleCreateOrGetEmployeeFolder(data) {
  var parentFolderId = data.parentFolderId;
  var folderName = data.folderName || ('EMP_' + (data.employeeCode || Date.now()));
  var existingFolderId = data.existingFolderId;

  var rootFolder;
  if (parentFolderId && parentFolderId.trim() !== '') {
    rootFolder = DriveApp.getFolderById(parentFolderId.trim());
  } else {
    var rootFolders = DriveApp.getFoldersByName('HR_Employees_Archive');
    if (rootFolders.hasNext()) {
      rootFolder = rootFolders.next();
    } else {
      rootFolder = DriveApp.createFolder('HR_Employees_Archive');
      rootFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
  }

  var empFolder = null;

  // فحص المجلد الحالي إذا كان موجوداً
  if (existingFolderId && existingFolderId.trim() !== '') {
    try {
      empFolder = DriveApp.getFolderById(existingFolderId.trim());
    } catch (e) {
      empFolder = null;
    }
  }

  // إذا لم يكن موجوداً، نبحث بالاسم داخل المجلد الرئيسي أو ننشئه
  if (!empFolder) {
    var searchFolders = rootFolder.getFoldersByName(folderName);
    if (searchFolders.hasNext()) {
      empFolder = searchFolders.next();
    } else {
      empFolder = rootFolder.createFolder(folderName);
      empFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
  }

  // إنشاء أو جلب المجلد الفرعي لصور البصمة الإلكترونية
  var biometricSubfolderName = '📸 صور البصمة الإلكترونية';
  var bioFolders = empFolder.getFoldersByName(biometricSubfolderName);
  var bioFolder = null;

  if (bioFolders.hasNext()) {
    bioFolder = bioFolders.next();
  } else {
    bioFolder = empFolder.createFolder(biometricSubfolderName);
    bioFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  return createJsonResponse({
    success: true,
    folderId: empFolder.getId(),
    folderName: empFolder.getName(),
    folderUrl: empFolder.getUrl(),
    biometricFolderId: bioFolder.getId(),
    biometricFolderUrl: bioFolder.getUrl()
  });
}

/**
 * 3. إنشاء أو جلب مجلد "مصروفات" والمجلد الفرعي المخصص للشهر (مثل: 2026-09)
 */
function handleCreateOrGetExpensesFolder(data) {
  var parentFolderId = data.parentFolderId;
  var monthStr = data.month || new Date().toISOString().slice(0, 7); // مثل 2026-09

  var rootFolder;
  if (parentFolderId && parentFolderId.trim() !== '') {
    rootFolder = DriveApp.getFolderById(parentFolderId.trim());
  } else {
    var rootFolders = DriveApp.getFoldersByName('HR_Employees_Archive');
    if (rootFolders.hasNext()) {
      rootFolder = rootFolders.next();
    } else {
      rootFolder = DriveApp.createFolder('HR_Employees_Archive');
      rootFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
  }

  // 1. مجلد "مصروفات" الرئيسي
  var expensesRootName = 'مصروفات';
  var expFolders = rootFolder.getFoldersByName(expensesRootName);
  var expensesFolder = null;
  if (expFolders.hasNext()) {
    expensesFolder = expFolders.next();
  } else {
    expensesFolder = rootFolder.createFolder(expensesRootName);
    expensesFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  // 2. المجلد المخصص للشهر داخل مجلد "مصروفات"
  var monthFolderName = monthStr;
  var mFolders = expensesFolder.getFoldersByName(monthFolderName);
  var monthFolder = null;
  if (mFolders.hasNext()) {
    monthFolder = mFolders.next();
  } else {
    monthFolder = expensesFolder.createFolder(monthFolderName);
    monthFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  return createJsonResponse({
    success: true,
    expensesFolderId: expensesFolder.getId(),
    expensesFolderUrl: expensesFolder.getUrl(),
    folderId: monthFolder.getId(),
    folderName: monthFolder.getName(),
    folderUrl: monthFolder.getUrl()
  });
}

/**
 * 4. رفع ملف إلى مجلد محدد
 */
function handleUploadFile(data) {
  try {
    var folderId = data.folderId;
    var fileName = data.fileName || ('File_' + Date.now());
    var mimeType = data.mimeType || 'application/octet-stream';
    var base64Data = data.base64Data;

    if (!folderId || !base64Data) {
      return createJsonResponse({ success: false, error: 'معرف المجلد أو محتوى الملف مفقود' });
    }

    // تنظيف base64 في حال وجود data:header
    if (base64Data.indexOf(';base64,') !== -1) {
      base64Data = base64Data.split(';base64,')[1];
    }
    base64Data = base64Data.trim();

    // معالجة الـ MIME type إذا كان عاماً أو غير دقيق لمنع استثناءات Google Apps Script
    if (!mimeType || mimeType === 'image' || mimeType === 'pdf' || mimeType.indexOf('/') === -1) {
      var lowerName = fileName.toLowerCase();
      if (lowerName.indexOf('.pdf') !== -1) mimeType = 'application/pdf';
      else if (lowerName.indexOf('.png') !== -1) mimeType = 'image/png';
      else if (lowerName.indexOf('.doc') !== -1) mimeType = 'application/msword';
      else mimeType = 'image/jpeg';
    }

    var targetFolder = DriveApp.getFolderById(folderId);
    var decodedBytes;
    try {
      decodedBytes = Utilities.base64Decode(base64Data);
    } catch (decodeErr) {
      var sanitized = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');
      decodedBytes = Utilities.base64Decode(sanitized);
    }

    var blob = Utilities.newBlob(decodedBytes, mimeType, fileName);

    // تنظيف النسخ القديمة لضمان تحديث الملف آلياً وبقاء أحدث نسخة فقط
    if (fileName.indexOf('ملخص_بيانات_الموظف') !== -1) {
      // إذا كان الملف ملخص بيانات الموظف، نحذف أي ملخص سابق له (سواء .html أو .doc أو .docx) لضمان عدم التكرار
      var allFolderFiles = targetFolder.getFiles();
      while (allFolderFiles.hasNext()) {
        var f = allFolderFiles.next();
        var fName = f.getName();
        if (fName.indexOf('ملخص_بيانات_الموظف') !== -1 || fName === fileName) {
          f.setTrashed(true);
        }
      }
    } else {
      // إذا كان ملفاً عادياً، نستبدل الملف الذي يحمل نفس الاسم
      var existingFiles = targetFolder.getFilesByName(fileName);
      while (existingFiles.hasNext()) {
        var oldFile = existingFiles.next();
        oldFile.setTrashed(true);
      }
    }

    var newFile = targetFolder.createFile(blob);
    newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return createJsonResponse({
      success: true,
      fileId: newFile.getId(),
      fileName: newFile.getName(),
      fileUrl: newFile.getUrl(),
      webViewLink: newFile.getUrl(),
      downloadUrl: newFile.getDownloadUrl()
    });
  } catch (err) {
    return createJsonResponse({ success: false, error: 'فشل معالجة الملف في جوجل درايف: ' + err.toString() });
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
