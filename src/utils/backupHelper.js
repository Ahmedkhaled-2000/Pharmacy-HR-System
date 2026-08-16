import { apiFetchFaces, apiSaveFace } from './apiClient';
import { saveBackupSnapshot, getBackupSnapshots, deleteBackupSnapshot } from './offlineStorage';

// Directory handle stored in memory for the active browser session
let activeDirectoryHandle = null;

// فحص تفعيل النسخ الاحتياطي التلقائي
export const isAutoBackupEnabled = () => {
  try {
    const val = localStorage.getItem('auto_backup_enabled');
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
};

export const setAutoBackupEnabled = (enabled) => {
  try {
    localStorage.setItem('auto_backup_enabled', String(enabled));
  } catch {}
};

// قراءة المسار المخصص المحدد
export const getCustomBackupPath = () => {
  try {
    return localStorage.getItem('auto_backup_custom_path') || 'مجلد النظام التلقائي (IndexedDB + مجلد التنزيلات)';
  } catch {
    return 'مجلد النظام التلقائي';
  }
};

export const setCustomBackupPath = (pathName) => {
  try {
    localStorage.setItem('auto_backup_custom_path', pathName);
  } catch {}
};

// اختيار مجلد على الجهاز باستخدام File System Access API
export const pickBackupDirectory = async () => {
  if ('showDirectoryPicker' in window) {
    try {
      const dirHandle = await window.showDirectoryPicker({
        id: 'pharmacy_hr_backups',
        mode: 'readwrite',
        startIn: 'documents'
      });
      activeDirectoryHandle = dirHandle;
      const folderName = dirHandle.name ? `📁 ${dirHandle.name}` : 'المجلد المحدد على الجهاز';
      setCustomBackupPath(folderName);
      return { success: true, name: folderName };
    } catch (e) {
      if (e.name === 'AbortError') {
        return { success: false, aborted: true };
      }
      console.warn('Directory picker failed:', e);
      return { success: false, error: e.message };
    }
  } else {
    return {
      success: false,
      notSupported: true,
      message: 'متصفحك يحفظ النسخ التلقائية في التخزين المحلي الآمن وقاعدة البيانات الداخلية'
    };
  }
};

// أخذ لقطة احتياطية تلقائية عند أي تعديل في البيانات
export const saveAutoBackupOnModification = async (currentState, trigger = 'تعديل بيانات المنظومة') => {
  if (!isAutoBackupEnabled()) return;
  if (!currentState || typeof currentState !== 'object') return;

  try {
    const timestamp = Date.now();
    const isoDate = new Date(timestamp).toISOString();

    const snapshot = {
      id: `snap_${timestamp}`,
      timestamp,
      isoDate,
      trigger,
      stats: {
        employeesCount: (currentState.employees || []).length,
        requestsCount: (currentState.requests || []).length,
        branchesCount: (currentState.branches || []).length,
        logsCount: (currentState.logs || []).length
      },
      appState: currentState
    };

    // 1. الحفظ في IndexedDB للقطات التلقائية
    await saveBackupSnapshot(snapshot);

    // 2. إذا كان المستخدم قد حدد مجلداً عبر File System Access API
    if (activeDirectoryHandle) {
      try {
        const fileHandle = await activeDirectoryHandle.getFileHandle(`HR_AutoBackup_Live.json`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(snapshot, null, 2));
        await writable.close();
      } catch (fsErr) {
        console.warn('[AutoBackup] FileSystem write skipped:', fsErr);
      }
    }

    // إشعار الواجهة بتحديث سجل النسخ الاحتياطية
    window.dispatchEvent(new CustomEvent('auto-backup-updated', { detail: snapshot }));
  } catch (e) {
    console.warn('[AutoBackup] Failed to take auto snapshot:', e);
  }
};

// تصدير نسخة احتياطية يدوية كاملة كملف JSON
export const exportFullBackup = async (currentState) => {
  try {
    // 1. Fetch employee faces/hands from MariaDB API
    let facesData = [];
    try {
      const data = await apiFetchFaces();
      if (Array.isArray(data)) facesData = data;
    } catch {}

    // 2. Create the backup object
    const backupObj = {
      timestamp: new Date().toISOString(),
      version: '2.0',
      database: 'MariaDB 10.11',
      appState: currentState,
      employeeFaces: facesData || []
    };

    // 3. Convert to string and trigger download
    const dataStr = JSON.stringify(backupObj, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `HR_Backup_${new Date().toISOString().split('T')[0]}_${Date.now().toString().slice(-4)}.json`;

    let linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    return { success: true };
  } catch (error) {
    console.error('Backup export failed:', error);
    return { success: false, error: error.message };
  }
};

// استرجاع نسخة احتياطية من ملف JSON
export const restoreFullBackup = async (fileContent, setState, saveState) => {
  try {
    const backupObj = JSON.parse(fileContent);

    const targetState = backupObj.appState || (backupObj.employees ? backupObj : null);
    if (!targetState) {
      throw new Error('الملف لا يحتوي على بيانات المنظومة الأساسية الصحيحة');
    }

    // 1. Restore App State
    if (setState) setState(targetState);
    if (saveState) await saveState(targetState);

    // 2. Restore Employee Faces (Biometrics) to MariaDB
    if (backupObj.employeeFaces && backupObj.employeeFaces.length > 0) {
      for (const faceRec of backupObj.employeeFaces) {
        if (!faceRec.employee_id) continue;
        const payload = {
          descriptor: faceRec.descriptor || null,
          hand_descriptor: faceRec.hand_descriptor || null,
          biometric_type: faceRec.biometric_type || 'face',
        };
        
        try {
          await apiSaveFace(faceRec.employee_id, payload);
        } catch {}
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Backup restore failed:', error);
    return { success: false, error: error.message };
  }
};

// جلب سجل اللقطات الاحتياطية
export const fetchSnapshotsList = async () => {
  return await getBackupSnapshots();
};

// حذف لقطة احتياطية
export const removeSnapshot = async (id) => {
  return await deleteBackupSnapshot(id);
};
