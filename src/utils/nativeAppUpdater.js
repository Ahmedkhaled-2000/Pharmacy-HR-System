/**
 * nativeAppUpdater.js
 * محرك التحديث الذاتي لتطبيق أندرويد عبر إضافة ApkUpdate الأصلية
 * يفحص التحديثات، يقارن الإصدارات، ويتحقق من سلامة الحزمة (SHA-256)
 */

import { registerPlugin } from '@capacitor/core';
import { API_BASE_URL } from './apiClient.js';

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
      versionName: '1.2.43',
      versionCode: 7,
      isNative: false
    };
  }

  try {
    const info = await ApkUpdate.getAppInfo();
    return {
      packageName: info.packageName,
      versionName: info.versionName,
      versionCode: Number(info.versionCode || 7),
      isNative: true
    };
  } catch (err) {
    console.warn('[NativeAppUpdater] Failed to get app info:', err);
    return {
      packageName: 'com.pharmacy.employee',
      versionName: '1.2.43',
      versionCode: 7,
      isNative: true
    };
  }
}

export const GITHUB_REPO = 'Ahmedkhaled-2000/Pharmacy-HR-System';
export const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

function parseVersion(v) {
  if (!v) return [0, 0, 0];
  const clean = String(v).replace(/^[^\d]*/, '').trim();
  return clean.split('.').map((part) => parseInt(part, 10) || 0);
}

function isNewerVersion(remoteVer, currentVer) {
  const r = parseVersion(remoteVer);
  const c = parseVersion(currentVer);
  const len = Math.max(r.length, c.length);
  for (let i = 0; i < len; i++) {
    const rPart = r[i] || 0;
    const cPart = c[i] || 0;
    if (rPart > cPart) return true;
    if (rPart < cPart) return false;
  }
  return false;
}

/**
 * فحص توفر تحديث جديد لتطبيق أندرويد عبر GitHub Releases وخادم المنظومة
 */
export async function checkNativeAppUpdate() {
  if (!isAndroidNative()) {
    return { hasUpdate: false, isNative: false };
  }

  try {
    const currentInfo = await getNativeAppVersion();

    // 1. المحاولة الأولى: الفحص المباشر عبر GitHub Releases السريعة والمجانية
    try {
      const ghRes = await fetch(GITHUB_RELEASES_API, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Pharmacy-HR-Mobile-Updater'
        },
        cache: 'no-store'
      });

      if (ghRes.ok) {
        const ghRelease = await ghRes.json();
        const tagVer = (ghRelease.tag_name || '').replace(/^v/i, '');
        const assets = ghRelease.assets || [];
        const apkAsset = assets.find((a) => a && a.name && a.name.toLowerCase().endsWith('.apk'));

        if (apkAsset && tagVer && isNewerVersion(tagVer, currentInfo.versionName)) {
          console.log(`[NativeAppUpdater] New update found on GitHub: ${tagVer} (current: ${currentInfo.versionName})`);
          return {
            hasUpdate: true,
            isNative: true,
            currentVersionName: currentInfo.versionName,
            currentVersionCode: currentInfo.versionCode,
            latestVersionName: tagVer,
            latestVersionCode: currentInfo.versionCode + 1,
            minSupportedCode: 1,
            isMandatory: (ghRelease.body || '').includes('[MANDATORY]'),
            downloadUrl: apkAsset.browser_download_url,
            sha256Checksum: '',
            fileSize: apkAsset.size || 0,
            releaseNotes: ghRelease.body || 'تحديث تلقائي جديد لمنظومة الموارد البشرية وبوابة الموظف.',
            releaseDate: ghRelease.published_at || ghRelease.created_at
          };
        }
      }
    } catch (ghErr) {
      console.warn('[NativeAppUpdater] Direct GitHub check failed, falling back to server API:', ghErr);
    }

    // 2. المحاولة الثانية: الفحص عبر خادم السحابة الاحتياطي (Server Update Manifest)
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
    if (!manifest || !manifest.success || !manifest.latest_version) {
      return { hasUpdate: false, isNative: true };
    }

    const hasUpdate = isNewerVersion(manifest.latest_version, currentInfo.versionName) ||
      (manifest.latest_version_code && Number(manifest.latest_version_code) > currentInfo.versionCode);

    const minSupported = Number(manifest.min_supported_code || 1);
    const isMandatory = manifest.mandatory_update || (currentInfo.versionCode < minSupported);

    return {
      hasUpdate,
      isNative: true,
      currentVersionName: currentInfo.versionName,
      currentVersionCode: currentInfo.versionCode,
      latestVersionName: manifest.latest_version,
      latestVersionCode: Number(manifest.latest_version_code || currentInfo.versionCode + 1),
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

export const LATEST_ANDROID_APK_FILENAME = 'pharmacy-employee-portal.apk';
export const LATEST_ANDROID_VERSION = '1.2.48';
export const GITHUB_LATEST_APK_URL = 'https://github.com/Ahmedkhaled-2000/Pharmacy-HR-System/releases/latest/download/pharmacy-employee-portal.apk';

/**
 * إرجاع رابط التنزيل المباشر لأحدث تطبيق أندرويد APK
 */
export function getAndroidApkDownloadUrl() {
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, origin } = window.location;
    if (hostname === '63.183.147.199' || hostname === 'pharmacore.site' || hostname.endsWith('.pharmacore.site')) {
      return `${origin}/downloads/${LATEST_ANDROID_APK_FILENAME}`;
    }
  }
  // التنزيل المباشر من GitHub Releases لأحدث إصدار رسمي متوفر عالمياً
  return GITHUB_LATEST_APK_URL;
}

/**
 * بدء تنزيل ملف أندرويد APK مباشرة للمستخدم في المتصفح أو التطبيق
 */
export function triggerAndroidApkDownload() {
  const url = getAndroidApkDownloadUrl();
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', LATEST_ANDROID_APK_FILENAME);
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
