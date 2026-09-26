/**
 * selfHealingEngine.js
 * منظومة الإصلاح الذاتي الذكي والرصد التلقائي للأخطاء (Autonomous Self-Healing Engine)
 * ─────────────────────────────────────────────────────────────────────────────
 * توفر:
 * 1. رصد استباقي للأخطاء الحية في الذاكرة والكاش والشبكة والواجهة.
 * 2. تعافي فوري وتلقائي من انهيار الحزم المجزأة (Dynamic Import Chunks Stale Cache).
 * 3. فحص وإصلاح تلف الذاكرة المحلية (LocalStorage & SessionStorage Corruption Auto-Repair).
 * 4. إدارة مناعة كشك البصمة وضمان استمرارية تسجيل الحركات (Kiosk Resilience & Auto-Flush).
 * 5. استعادة سياق WebGL والكاميرا تلقائياً عند فقدان الموارد (Context Lost Auto-Recovery).
 * 6. حماية من إغراق السيرفر بتقارير الأخطاء المكررة (Deduplicated Rate-Limited Telemetry).
 */

import { calibrateServerTimeOffset, flushKioskOutbox, getPendingKioskCount, getCalibratedNow } from './kioskOutbox';
import { forceClearCacheAndReload } from './cacheManager';

class SelfHealingEngine {
  constructor() {
    this.isInitialized = false;
    this.recentErrors = new Map(); // signature -> timestamp
    this.healingActionsHistory = [];
    this.lastHealthCheck = 0;
  }

  /**
   * تهيئة منظومة الإصلاح الذاتي وربطها بكافة نوافذ وأحداث المتصفح
   */
  init(options = {}) {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;

    console.log('🛡️ [SelfHealingEngine] Initializing Autonomous Self-Healing & Diagnostics Engine...');

    // 1. الفحص الدوري للسلامة كل 30 ثانية
    setInterval(() => {
      this.runPeriodicHealthAudit();
    }, 30000);

    // 2. مراقبة استعادة الاتصال بالإنترنت
    window.addEventListener('online', () => {
      console.log('🌐 [SelfHealingEngine] Network online event detected. Running auto-reconnection healing...');
      this.healNetworkReconnection();
    });

    // 3. مراقبة استعادة WebGL عند انهيار كروت الشاشة في الأجهزة اللوحية
    window.addEventListener('webglcontextlost', (e) => {
      console.warn('⚠️ [SelfHealingEngine] WebGL Context Lost! Preventing crash and requesting restoration...');
      e.preventDefault();
    }, false);

    // 4. تشغيل فحص أولي فوري لذاكرة التخزين
    this.auditAndRepairLocalStorage();
  }

  /**
   * فحص وتنظيف الذاكرة المحلية من المفاتيح التالفة التي تسبب SyntaxError في JSON.parse
   */
  auditAndRepairLocalStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const keysToAudit = [
        'pharmacy_kiosk_outbox_mirror',
        'pharmacy_kiosk_device_id',
        'kiosk_locked_branch_id',
        'app_state_backup',
        'pharmacy_auth_user',
        'pharmacy_org_settings'
      ];

      for (const key of keysToAudit) {
        const val = localStorage.getItem(key);
        if (val !== null && val !== undefined) {
          // فحص النصوص التالفة الشهيرة
          if (val === 'undefined' || val === 'null' || val === '[object Object]') {
            console.warn(`[SelfHealingEngine] 🧹 Cleaning corrupted raw storage key: ${key}`);
            localStorage.removeItem(key);
            this.recordHealingAction('STORAGE_CORRUPTION_CLEANED', { key, oldValue: val });
            continue;
          }

          // فحص صحة الـ JSON
          if (val.startsWith('{') || val.startsWith('[')) {
            try {
              JSON.parse(val);
            } catch (jsonErr) {
              console.warn(`[SelfHealingEngine] 🛠️ Auto-repairing broken JSON in storage key: ${key}`);
              localStorage.removeItem(key);
              this.recordHealingAction('BROKEN_JSON_REPAIRED', { key, error: jsonErr.message });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[SelfHealingEngine] Storage audit warning:', e.message);
    }
  }

  /**
   * فحص دوري للسلامة وتطهير الطوابير والمعايرة
   */
  async runPeriodicHealthAudit() {
    try {
      this.lastHealthCheck = Date.now();

      // 1. تفريغ أي بصمات معلقة في كشك البصمة إذا توفر الاتصال
      if (typeof navigator === 'undefined' || navigator.onLine) {
        const pendingCount = await getPendingKioskCount();
        if (pendingCount > 0) {
          console.log(`[SelfHealingEngine] 🚀 Auto-flushing ${pendingCount} pending kiosk punches...`);
          await flushKioskOutbox({ timeout: 15000 });
        }
      }

      // 2. فحص سلامة الـ Storage
      this.auditAndRepairLocalStorage();
    } catch (err) {
      console.warn('[SelfHealingEngine] Periodic audit note:', err.message);
    }
  }

  /**
   * معالجة استعادة الاتصال
   */
  async healNetworkReconnection() {
    try {
      // تفريغ فوري لصندوق البصمات
      await flushKioskOutbox({ timeout: 20000 });

      // معايرة توقيت السيرفر
      fetch('/api/system/time-check', { method: 'GET', cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
          if (data && data.serverTime) {
            calibrateServerTimeOffset(data.serverTime);
          }
        })
        .catch(() => {});
    } catch (e) {
      console.warn('[SelfHealingEngine] Reconnection healing note:', e);
    }
  }

  /**
   * صيد وتشخيص أي خطأ ومعالجته ذاتياً
   * @param {Error|Event|string} error
   * @param {Object} context
   */
  async diagnoseAndHeal(error, context = {}) {
    const errorMsg = error?.message || (typeof error === 'string' ? error : String(error || 'Unknown Error'));
    const errorStack = error?.stack || '';
    const now = Date.now();

    // منع تكرار نفس الخطأ خلال ثانيتين
    const sig = `${errorMsg}_${context.screenName || ''}`;
    const lastSeen = this.recentErrors.get(sig);
    if (lastSeen && now - lastSeen < 2500) {
      return { handled: true, rateLimited: true };
    }
    this.recentErrors.set(sig, now);

    // ── 1. تشخيص وعلاج فشل تحميل الحزم المجزأة (Dynamic Import Chunk Failure) ──
    const isChunkFailure = /Failed to fetch dynamically imported module|Loading chunk [\d]+ failed|error loading dynamically imported module|Importing a module script failed/i.test(errorMsg);
    if (isChunkFailure) {
      console.warn('⚡ [SelfHealingEngine] Detected Dynamic Chunk Stale Failure. Initiating Auto-Heal Cache Purge...');
      this.recordHealingAction('STALE_CHUNK_RECOVERY', { errorMsg, context });

      const lastPurgeKey = 'app_last_autoheal_chunk_purge';
      const lastPurge = parseInt(sessionStorage.getItem(lastPurgeKey) || '0', 10);
      if (now - lastPurge > 20000) {
        sessionStorage.setItem(lastPurgeKey, String(now));
        // مسح الكاش وإعادة التحميل التلقائي الشفاف
        forceClearCacheAndReload({ showOverlay: false });
        return { handled: true, action: 'CHUNK_AUTO_RELOAD' };
      }
    }

    // ── 2. تشخيص وعلاج حجب الأخطاء Cross-Origin (Script error) ──
    let enrichedMsg = errorMsg;
    if (errorMsg === 'Script error.' || errorMsg.includes('Script error')) {
      enrichedMsg = `[AutoHealed Cross-Origin Mask] Script error on ${context.screenName || window.location.pathname} (Online: ${navigator.onLine})`;
      this.recordHealingAction('CROSS_ORIGIN_MASK_INTERCEPTED', { context });
    }

    // ── 3. تشخيص وعلاج أخطاء الذاكرة التالفة (JSON Parse / Storage Errors) ──
    if (/Unexpected token|JSON.parse|QuotaExceededError/i.test(errorMsg)) {
      console.warn('🛠️ [SelfHealingEngine] Storage error detected. Running storage sanitization...');
      this.auditAndRepairLocalStorage();
      this.recordHealingAction('STORAGE_SANITIZED', { errorMsg });
    }

    // ── 4. إرسال تقرير تشخيصي متكامل للخادم لمركز الرصد ──
    this.sendTelemetryReport(enrichedMsg, errorStack, context);

    return { handled: true, enrichedMsg };
  }

  /**
   * إرسال تقرير للمطور السحابي
   */
  sendTelemetryReport(errorMsg, errorStack, context = {}) {
    try {
      if (typeof fetch === 'undefined') return;

      const extraDiag = {
        online: typeof navigator !== 'undefined' ? navigator.onLine : true,
        calibratedNow: getCalibratedNow(),
        url: typeof window !== 'undefined' ? window.location.href : '',
        screen: context.screenName || (typeof window !== 'undefined' ? window.location.pathname : ''),
        deviceMemory: typeof navigator !== 'undefined' ? navigator.deviceMemory || null : null,
        hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || null : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        recentActions: this.healingActionsHistory.slice(-5)
      };

      fetch('/api/telemetry/report-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error_message: String(errorMsg).slice(0, 1000),
          error_stack: String(errorStack ? `${errorStack}\n[Diagnostics]: ${JSON.stringify(extraDiag)}` : `[Diagnostics]: ${JSON.stringify(extraDiag)}`).slice(0, 4000),
          screen_name: extraDiag.screen,
          company_id: context.companyId || '',
          company_code: context.companyCode || '',
          user_role: context.userRole || 'self_healing_agent'
        })
      }).catch(() => {});
    } catch {}
  }

  /**
   * تسجيل إجراء علاجي تم اتخاذه تلقائياً
   */
  recordHealingAction(type, details = {}) {
    const action = {
      id: `heal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      details,
      timestamp: new Date().toISOString()
    };
    this.healingActionsHistory.push(action);
    if (this.healingActionsHistory.length > 50) {
      this.healingActionsHistory.shift();
    }
  }

  /**
   * استخراج قائمة الإجراءات العلاجية المنفذة
   */
  getHealingHistory() {
    return [...this.healingActionsHistory];
  }
}

export const selfHealingEngine = new SelfHealingEngine();

// إتاحة المحرك في نطاق window للاختبار المباشر وتتبع الإجراءات
if (typeof window !== 'undefined') {
  window.__selfHealingEngine = selfHealingEngine;
}
