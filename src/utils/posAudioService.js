/**
 * posAudioService.js
 * خدمة المؤثرات الصوتية اللحظية لنظام نقاط البيع (Zero-Asset Web Audio Synthesizer)
 * - لا تتطلب أي ملفات صوتية خارجية (MP3/WAV)، وتعمل دون أي استهلاك للشبكة 100% Offline.
 * - توليد نغمات رقمية فائقة الاستجابة (Ultra-low latency) بواسطة Web Audio API:
 *   1. نغمة مسح الباركود السريع (Barcode Scanner Beep 880Hz -> 1320Hz).
 *   2. نغمة التنبيه للتعارضات أو نقص الرصيد (Warning Double-Pulse 440Hz -> 330Hz).
 *   3. نغمة إتمام البيع وخروج الإيصال (Cash Register Chime 523Hz -> 659Hz -> 784Hz).
 */

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * 1. نغمة مسح الباركود وإضافة الصنف (Positive Crisp Beep)
 */
export function playBarcodeSuccessBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const now = ctx.currentTime;

    // قفزة ترددية مبهجة من 880Hz إلى 1320Hz خلال 65ms
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.05);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.075);
  } catch (e) {
    // كتم الأخطاء في بيئات المتصفح المقيدة للصوت
  }
}

/**
 * 2. نغمة التحذير والتعارض الدوائي (Warning Double Pulse)
 */
export function playWarningAlertSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // نبضة أولى 440Hz
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(440, now);
    gain1.gain.setValueAtTime(0.25, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.095);

    // نبضة ثانية 330Hz بعد 110ms
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(330, now + 0.11);
    gain2.gain.setValueAtTime(0.25, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.11);
    osc2.stop(now + 0.23);
  } catch (e) {}
}

/**
 * 3. نغمة نجاح الدفع وإتمام الفاتورة (Register Cash Chime)
 */
export function playCashRegisterChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 Arpeggio

    notes.forEach((freq, idx) => {
      const startTime = now + (idx * 0.05);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.23);
    });
  } catch (e) {}
}
