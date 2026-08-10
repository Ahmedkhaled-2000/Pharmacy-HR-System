import { db } from './supabaseClient';

/**
 * حفظ بصمة وجه الموظف في الجدول المخصص مع استخدام upsert بدلاً من update/insert التكيفي
 * @param {string} employeeId - معرّف الموظف
 * @param {Float32Array|Array} descriptorArray - مصفوفة بصمة الوجه
 */
export async function saveFaceDescriptor(employeeId, descriptorArray) {
  try {
    const descriptor = Array.from(descriptorArray); 
    
    // Supabase upsert: تحديث إذا كان موجوداً وإلا إدراج سجل جديد بأمان
    const { error } = await db
      .from('employee_faces')
      .upsert(
        { 
          employee_id: employeeId, 
          descriptor: descriptor, 
          updated_at: new Date().toISOString() 
        },
        { onConflict: 'employee_id' }
      );

    if (error) {
      console.warn('[FaceStorage] Supabase upsert error for face descriptor:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[FaceStorage] Exception saving face descriptor:', err);
    return { success: false, error: err.message };
  }
}

/**
 * جلب بصمة وجه الموظف من الجدول المخصص
 * @param {string} employeeId - معرّف الموظف
 * @returns {Float32Array|null} - مصفوفة بصمة الوجه أو null
 */
export async function loadFaceDescriptor(employeeId) {
  try {
    const { data, error } = await db
      .from('employee_faces')
      .select('descriptor')
      .eq('employee_id', employeeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('[FaceStorage] Error loading face descriptor:', error);
      return null;
    }

    if (data && data.descriptor) {
      return new Float32Array(data.descriptor);
    }
    return null;
  } catch (err) {
    console.error('[FaceStorage] Exception loading face descriptor:', err);
    return null;
  }
}

/**
 * حفظ بصمة يد الموظف في الجدول المخصص مع استخدام upsert
 * @param {string} employeeId - معرّف الموظف
 * @param {Array} descriptorArray - مصفوفة بصمة اليد
 */
export async function saveHandDescriptor(employeeId, descriptorArray) {
  try {
    const descriptor = Array.from(descriptorArray); 
    
    // Supabase upsert: تحديث أو إدراج تلقائي في كويري واحد
    const { error } = await db
      .from('employee_faces')
      .upsert(
        { 
          employee_id: employeeId, 
          hand_descriptor: descriptor, 
          updated_at: new Date().toISOString() 
        },
        { onConflict: 'employee_id' }
      );

    if (error) {
      console.warn('[FaceStorage] Supabase upsert error for hand descriptor:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('[FaceStorage] Exception saving hand descriptor:', err);
    return { success: false, error: err.message };
  }
}

/**
 * جلب بصمة يد الموظف
 */
export async function loadHandDescriptor(employeeId) {
  try {
    const { data, error } = await db
      .from('employee_faces')
      .select('hand_descriptor')
      .eq('employee_id', employeeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[FaceStorage] Error loading hand descriptor:', error);
      return null;
    }

    if (data && data.hand_descriptor) {
      return data.hand_descriptor;
    }
    return null;
  } catch (err) {
    console.error('[FaceStorage] Exception loading hand descriptor:', err);
    return null;
  }
}

/**
 * حذف بصمة وجه الموظف من الجدول المخصص
 */
export async function deleteFaceDescriptor(employeeId) {
  try {
    const { error } = await db
      .from('employee_faces')
      .update({ descriptor: null })
      .eq('employee_id', employeeId);

    if (error) {
      console.error('[FaceStorage] Error deleting face descriptor:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error('[FaceStorage] Exception deleting face descriptor:', err);
    return { success: false, error: err.message };
  }
}

/**
 * حذف بصمة يد الموظف من الجدول المخصص
 */
export async function deleteHandDescriptor(employeeId) {
  try {
    const { error } = await db
      .from('employee_faces')
      .update({ hand_descriptor: null })
      .eq('employee_id', employeeId);

    if (error) {
      console.error('[FaceStorage] Error deleting hand descriptor:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error('[FaceStorage] Exception deleting hand descriptor:', err);
    return { success: false, error: err.message };
  }
}
