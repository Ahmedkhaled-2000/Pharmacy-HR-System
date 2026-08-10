import { db, STORAGE_KEY } from './supabaseClient';
import { smartSaveState } from './offlineSync';

export const exportFullBackup = async (currentState) => {
  try {
    // 1. Fetch employee faces/hands
    const { data: facesData, error: facesError } = await db.from('employee_faces').select('*');
    if (facesError) throw new Error(facesError.message);

    // 2. Create the backup object
    const backupObj = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      appState: currentState,
      employeeFaces: facesData || []
    };

    // 3. Convert to string and trigger download
    const dataStr = JSON.stringify(backupObj);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `HR_Backup_${new Date().toISOString().split('T')[0]}.json`;

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

export const restoreFullBackup = async (fileContent, setState, saveState) => {
  try {
    const backupObj = JSON.parse(fileContent);

    if (!backupObj.appState) {
      throw new Error('الملف لا يحتوي على بيانات المنظومة الأساسية');
    }

    // 1. Restore App State
    if (setState) setState(backupObj.appState);
    if (saveState) await saveState(backupObj.appState); // This triggers offlineSync logic

    // 2. Restore Employee Faces (Biometrics)
    if (backupObj.employeeFaces && backupObj.employeeFaces.length > 0) {
      // Upsert in batches or one by one
      for (const faceRec of backupObj.employeeFaces) {
        // We only upsert employee_id, descriptor, hand_descriptor if available
        const payload = { employee_id: faceRec.employee_id };
        if (faceRec.descriptor) payload.descriptor = faceRec.descriptor;
        if (faceRec.hand_descriptor) payload.hand_descriptor = faceRec.hand_descriptor;
        
        await db.from('employee_faces').upsert(payload, { onConflict: 'employee_id' });
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Backup restore failed:', error);
    return { success: false, error: error.message };
  }
};
