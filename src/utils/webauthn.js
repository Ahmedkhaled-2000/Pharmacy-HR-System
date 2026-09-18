/**
 * Biometric utility for Device Fingerprint Authentication
 *
 * Strategy:
 * 1. If running inside a Capacitor Android/iOS app → use native BiometricAuth plugin
 * 2. Otherwise (web browser) → use WebAuthn (PublicKeyCredential)
 */

import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';

// Detect if running inside a Capacitor native app
function isCapacitorNative() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

// Helper to convert ArrayBuffer to Base64url (for WebAuthn fallback)
function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Helper to convert Base64url to ArrayBuffer (for WebAuthn fallback)
function base64urlToBuffer(base64url) {
  const padding = '='.repeat((4 - base64url.length % 4) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

/**
 * Check if biometric authentication is available on this device/browser.
 * Returns true if available, false otherwise.
 */
export async function isBiometricAvailable() {
  if (isCapacitorNative()) {
    try {
      const info = await BiometricAuth.checkBiometry();
      return info.isAvailable;
    } catch (e) {
      return false;
    }
  }
  // Web browser fallback: check WebAuthn support
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (available) return true;
    }
    // PublicKeyCredential is present on the browser
    return true;
  } catch (e) {
    return true;
  }
}

/**
 * Register biometric for an employee.
 * In Capacitor: performs a biometric verification to confirm presence.
 * In browser: uses WebAuthn to create a platform credential.
 * Returns a credential ID string to store per employee.
 */
export async function registerLocalBiometric(empName, empId) {
  if (isCapacitorNative()) {
    // On native Android/iOS, we verify the user via native biometric
    // then return a unique key derived from empId (since native biometric
    // doesn't create a credential ID like WebAuthn)
    try {
      await BiometricAuth.authenticate({
        reason: `تسجيل بصمة الموظف: ${empName}`,
        cancelTitle: 'إلغاء',
        allowDeviceCredential: true,
        iosFallbackTitle: 'استخدم رمز الجهاز',
        androidTitle: 'تسجيل البصمة',
        androidSubtitle: `سجّل بصمتك للدخول كـ ${empName}`,
        androidConfirmationRequired: false,
      });
      // Return a unique credential ID based on employee ID
      return `native_biometric_${empId}_${Date.now()}`;
    } catch (err) {
      console.error('Native Biometric Registration Error:', err);
      throw new Error('تم إلغاء عملية البصمة أو جهازك لا يدعمها. (' + (err.message || err.code) + ')');
    }
  }

  // ── Web / Browser fallback: WebAuthn ──
  if (!window.PublicKeyCredential) {
    throw new Error('جهازك أو متصفحك لا يدعم نظام البصمة الحديث.');
  }

  const userIdBuffer = new TextEncoder().encode(String(empId || 'user'));

  const publicKey = {
    challenge: window.crypto.getRandomValues(new Uint8Array(32)),
    rp: {
      name: 'نظام الموارد البشرية وبوابة الموظف',
    },
    user: {
      id: userIdBuffer,
      name: String(empName || 'employee'),
      displayName: String(empName || 'employee'),
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },   // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
      residentKey: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
  };

  try {
    const credential = await navigator.credentials.create({ publicKey });
    if (!credential) throw new Error('فشل في إنشاء البصمة');
    return bufferToBase64url(credential.rawId);
  } catch (err) {
    console.error('WebAuthn Registration Error:', err);
    if (err.name === 'NotAllowedError') {
      throw new Error('تم إلغاء عملية المصادقة بالبصمة أو انتهت المهلة.');
    }
    if (err.name === 'NotSupportedError') {
      throw new Error('متصفحك أو جهازك لا يدعم البصمة المدمجة (Windows Hello / Touch ID).');
    }
    throw new Error('تعذر تفعيل البصمة في المتصفح: ' + (err.message || ''));
  }
}

/**
 * Verify biometric for an employee.
 * In Capacitor: triggers native biometric prompt.
 * In browser: uses WebAuthn assertion.
 * Returns true on success.
 */
export async function verifyLocalBiometric(credentialIdBase64) {
  if (isCapacitorNative()) {
    // Native Android/iOS biometric verification
    try {
      await BiometricAuth.authenticate({
        reason: 'أثبت هويتك لتسجيل حضورك',
        cancelTitle: 'إلغاء',
        allowDeviceCredential: true,
        iosFallbackTitle: 'استخدم رمز الجهاز',
        androidTitle: 'تأكيد البصمة',
        androidSubtitle: 'ضع إصبعك على مستشعر البصمة',
        androidConfirmationRequired: false,
      });
      return true;
    } catch (err) {
      console.error('Native Biometric Verification Error:', err);
      throw new Error('تم إلغاء عملية البصمة أو فشل التحقق. (' + (err.message || err.code) + ')');
    }
  }

  // ── Web / Browser fallback: WebAuthn ──
  if (!window.PublicKeyCredential) {
    throw new Error('جهازك أو متصفحك لا يدعم نظام البصمة الحديث.');
  }

  const credentialIdBuffer = base64urlToBuffer(credentialIdBase64);

  const publicKey = {
    challenge: window.crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{
      id: credentialIdBuffer,
      type: 'public-key',
    }],
    userVerification: 'preferred',
    timeout: 60000,
  };

  try {
    const assertion = await navigator.credentials.get({ publicKey });
    if (!assertion) throw new Error('فشل التحقق من البصمة.');
    return true;
  } catch (err) {
    console.error('WebAuthn Verification Error:', err);
    if (err.name === 'NotAllowedError') {
      throw new Error('تم إلغاء التحقق بالبصمة في المتصفح.');
    }
    throw new Error('تعذر التحقق من البصمة: ' + (err.message || ''));
  }
}

/**
 * المصادقة الموحدة بالبصمة الحيوية لتسجيل الدخول الفوري (تطبيق الهاتف + متصفح الويب)
 */
export async function authenticateUserBiometrics({ username, displayName = '', savedCredentialId = null }) {
  const userLabel = displayName || username || 'المستخدم';

  // 1. تطبيق أندرويد الأصلي (Capacitor)
  if (isCapacitorNative()) {
    try {
      await BiometricAuth.authenticate({
        reason: `تسجيل الدخول كـ ${userLabel}`,
        cancelTitle: 'إلغاء',
        allowDeviceCredential: true,
        androidTitle: 'بصمة الإصبع أو الوجه',
        androidSubtitle: `تأكيد الهوية للدخول الفوري: ${userLabel}`,
        androidConfirmationRequired: false
      });
      return { success: true };
    } catch (err) {
      console.warn('[BiometricAuth Native Error]:', err);
      throw new Error('تم إلغاء التحقق بالبصمة أو لم يتم التعرف على الهوية.');
    }
  }

  // 2. متصفح الويب (WebAuthn / Windows Hello / Touch ID)
  if (!window.PublicKeyCredential) {
    throw new Error('متصفحك أو جهازك الحالي لا يدعم ميزة الدخول بالبصمة الحيوية.');
  }

  try {
    if (savedCredentialId) {
      try {
        await verifyLocalBiometric(savedCredentialId);
        return { success: true, credentialId: savedCredentialId };
      } catch (verifyErr) {
        if (verifyErr.name === 'NotAllowedError' || verifyErr.message?.includes('إلغاء')) {
          throw verifyErr;
        }
        console.warn('[WebAuthn] Saved credential check failed, falling back to fresh register:', verifyErr);
        const newCredId = await registerLocalBiometric(userLabel, String(username || 'user'));
        return { success: true, credentialId: newCredId };
      }
    } else {
      // تسجيل بصمة جديدة على هذا الجهاز للمتصفح فورياً
      const credId = await registerLocalBiometric(userLabel, String(username || 'user'));
      return { success: true, credentialId: credId };
    }
  } catch (err) {
    console.warn('[BiometricAuth Web Error]:', err);
    throw new Error(err.message || 'تم إلغاء التحقق بالبصمة في المتصفح.');
  }
}

