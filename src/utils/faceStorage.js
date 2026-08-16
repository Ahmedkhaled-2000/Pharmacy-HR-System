/**
 * faceStorage.js
 * تخزين وإدارة بصمات الوجه واليد الحيوية في MariaDB عبر PHP API
 */

import { apiFetchFaces, apiSaveFace, apiDeleteFace } from './apiClient';

/**
 * حفظ بصمة وجه الموظف في MariaDB
 * @param {string} employeeId - معرّف الموظف
 * @param {Float32Array|Array} descriptorArray - مصفوفة بصمة الوجه
 */
export async function saveFaceDescriptor(employeeId, descriptorArray) {
  try {
    const descriptor = Array.from(descriptorArray);
    const res = await apiSaveFace(employeeId, {
      descriptor,
      biometric_type: 'face',
    });

    if (!res?.success) {
      console.warn('[FaceStorage] API error for face descriptor:', res?.error);
      return { success: false, error: res?.error };
    }

    return { success: true };
  } catch (err) {
    console.error('[FaceStorage] Exception saving face descriptor:', err);
    return { success: false, error: err.message };
  }
}

/**
 * جلب بصمة وجه الموظف من MariaDB
 * @param {string} employeeId - معرّف الموظف
 * @returns {Float32Array|null} - مصفوفة بصمة الوجه أو null
 */
export async function loadFaceDescriptor(employeeId) {
  try {
    const data = await apiFetchFaces(employeeId);
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
 * حفظ بصمة يد الموظف في MariaDB
 * @param {string} employeeId - معرّف الموظف
 * @param {Array} descriptorArray - مصفوفة بصمة اليد
 */
export async function saveHandDescriptor(employeeId, descriptorArray) {
  try {
    const descriptor = Array.from(descriptorArray);
    const res = await apiSaveFace(employeeId, {
      hand_descriptor: descriptor,
      biometric_type: 'hand',
    });

    if (!res?.success) {
      console.warn('[FaceStorage] API error for hand descriptor:', res?.error);
      return { success: false, error: res?.error };
    }

    return { success: true };
  } catch (err) {
    console.error('[FaceStorage] Exception saving hand descriptor:', err);
    return { success: false, error: err.message };
  }
}

/**
 * جلب بصمة يد الموظف من MariaDB
 */
export async function loadHandDescriptor(employeeId) {
  try {
    const data = await apiFetchFaces(employeeId);
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
 * حذف بصمة وجه الموظف
 */
export async function deleteFaceDescriptor(employeeId) {
  try {
    const existing = await apiFetchFaces(employeeId);
    if (existing) {
      await apiSaveFace(employeeId, {
        descriptor: null,
        hand_descriptor: existing.hand_descriptor || null,
      });
    }
    return { success: true };
  } catch (err) {
    console.error('[FaceStorage] Exception deleting face descriptor:', err);
    return { success: false, error: err.message };
  }
}

/**
 * حذف بصمة يد الموظف
 */
export async function deleteHandDescriptor(employeeId) {
  try {
    const existing = await apiFetchFaces(employeeId);
    if (existing) {
      await apiSaveFace(employeeId, {
        descriptor: existing.descriptor || null,
        hand_descriptor: null,
      });
    }
    return { success: true };
  } catch (err) {
    console.error('[FaceStorage] Exception deleting hand descriptor:', err);
    return { success: false, error: err.message };
  }
}

/**
 * حذف كافة البيانات الحيوية للموظف (وجه + يد)
 */
export async function deleteBiometricData(employeeId) {
  try {
    await apiDeleteFace(employeeId);
    return { success: true };
  } catch (err) {
    console.error('[FaceStorage] Exception deleting biometrics:', err);
    return { success: false, error: err.message };
  }
}
