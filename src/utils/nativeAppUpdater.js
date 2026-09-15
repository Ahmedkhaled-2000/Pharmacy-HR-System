/**
 * nativeAppUpdater.js
 * محرك التحديث الذاتي لتطبيق أندرويد عبر إضافة ApkUpdate الأصلية
 * يفحص التحديثات، يقارن الإصدارات، ويتحقق من سلامة الحزمة (SHA-256)
 */

import { registerPlugin } from '@capacitor/core';
import { API_BASE_URL } from './apiClient';

// تسجيل الإضافة الأصلية في بيئة Capacitor
export const ApkUpdate = registerPlugin('ApkUpdate');

export function isAndroidNative() {
  return typeof window !== 'undefined' &&
    Boolean(window.Capacitor?.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.getPlatform() === 'android');
}

/**
 * جلب معلومات التطبيق الحالية (الإصدار وكود الإصدار واسم الحزمة)
 */
export async function getNativeAppVersion() {
  if (!isAndroidNative()) {
    return {
      packageName: 'com.pharmacy.employee',
      versionName: '1.2.38',
      versionCode: 1,
      isNative: false
    };
  }

  try {
    const info = await ApkUpdate.getAppInfo();
    return {
      packageName: info.packageName,
      versionName: info.versionName,
      versionCode: Number(info.versionCode || 1),
      isNative: true
    };
  } catch (err) {
    console.warn('[NativeAppUpdater] Failed to get app info:', err);
    return {
      packageName: 'com.pharmacy.employee',
      versionName: '1.2.38',
      versionCode: 1,
      isNative: true
    };
  }
}

/**
 * فحص توفر تحديث جديد من السيرفر
 */
export async function checkNativeAppUpdate() {
  if (!isAndroidNative()) {
    return { hasUpdate: false, isNative: false };
  }

  try {
    const currentInfo = await getNativeAppVersion();
    const manifestUrl = `${API_BASE_URL}/app/update-manifest?platform=android&current_version_code=${currentInfo.versionCode}`;

    const res = await fetch(manifestUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });

    if (!res.ok) {
      console.warn('[NativeAppUpdater] Server returned status:', res.status);
      return { hasUpdate: false, isNative: true };
    }

    const manifest = await res.json();
    if (!manifest || !manifest.success || !manifest.latest_version_code) {
      return { hasUpdate: false, isNative: true };
    }

    const latestCode = Number(manifest.latest_version_code);
    const minSupported = Number(manifest.min_supported_code || 1);
    const hasUpdate = latestCode > currentInfo.versionCode;
    const isMandatory = manifest.mandatory_update || (currentInfo.versionCode < minSupported);

    return {
      hasUpdate,
      isNative: true,
      currentVersionName: currentInfo.versionName,
      currentVersionCode: currentInfo.versionCode,
      latestVersionName: manifest.latest_version,
      latestVersionCode: latestCode,
      minSupportedCode: minSupported,
      isMandatory,
      downloadUrl: manifest.download_url,
      sha256Checksum: manifest.sha256_checksum || '',
      fileSize: manifest.file_size || 0,
      releaseNotes: manifest.release_notes || '',
      releaseDate: manifest.release_date || null
    };
  } catch (err) {
    console.warn('[NativeAppUpdater] Check error:', err);
    return { hasUpdate: false, isNative: true, error: err.message };
  }
}

/**
 * تنزيل وتثبيت التحديث مع تتبع التقدم
 */
export async function downloadAndInstallNativeUpdate({ downloadUrl, sha256Checksum, onProgress, onError }) {
  if (!isAndroidNative()) {
    throw new Error('التحديث التلقائي متاح فقط على أجهزة أندرويد');
  }

  try {
    // 1. فحص إذن تثبيت التطبيقات غير المعروفة
    const permStatus = await ApkUpdate.checkInstallPermission();
    if (!permStatus.granted) {
      await ApkUpdate.openInstallPermissionSettings();
      // انتظر قليلاً ليعود المستخدم
      await new Promise(r => setTimeout(r, 2000));
    }

    // 2. الاشتراك في أحداث التقدم
    let progressListener = null;
    let errorListener = null;

    if (typeof onProgress === 'function') {
      progressListener = await ApkUpdate.addListener('downloadProgress', (data) => {
        onProgress(data.percent || 0, data.currentBytes || 0, data.totalBytes || 0);
      });
    }

    if (typeof onError === 'function') {
      errorListener = await ApkUpdate.addListener('downloadError', (data) => {
        onError(data.error || 'Unknown download error');
      });
    }

    // 3. بدء التنزيل والتثبيت
    const res = await ApkUpdate.downloadAndInstall({
      downloadUrl,
      expectedSha256: sha256Checksum || '',
      fileName: `pharmacy_hr_update_${Date.now()}.apk`
    });

    if (progressListener) progressListener.remove();
    if (errorListener) errorListener.remove();

    return res;
  } catch (err) {
    console.error('[NativeAppUpdater] Download and install error:', err);
    throw err;
  }
}
