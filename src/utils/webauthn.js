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
  // Web fallback: check WebAuthn
  if (!window.PublicKeyCredential) return false;
  try {
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return available;
  } catch (e) {
    return false;
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

  const publicKey = {
    challenge: window.crypto.getRandomValues(new Uint8Array(32)),
    rp: {
      name: 'نظام الحضور والانصراف',
    },
    user: {
      id: Uint8Array.from(empId, c => c.charCodeAt(0)),
      name: empName,
      displayName: empName,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },   // ES256
      { type: 'public-key', alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
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
    throw new Error('تم إلغاء عملية البصمة أو جهازك لا يدعمها. (' + err.message + ')');
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
    userVerification: 'required',
    timeout: 60000,
  };

  try {
    const assertion = await navigator.credentials.get({ publicKey });
    if (!assertion) throw new Error('فشل التحقق من البصمة.');
    return true;
  } catch (err) {
    console.error('WebAuthn Verification Error:', err);
    throw new Error('تم إلغاء عملية البصمة أو فشل التحقق. (' + err.message + ')');
  }
}
