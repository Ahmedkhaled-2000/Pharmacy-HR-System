/**
 * requestLifecycle.js
 * آلة حالات دورة حياة الطلبات (Request Lifecycle State Machine)
 * تحدد الحالات، التحولات المسموحة، مفاتيح الإعادة (Idempotency Keys)، وطوابع التدقيق الزمني
 */

// ── حالات دورة حياة الطلب ──────────────────────────────────────────────────
export const REQUEST_STATES = {
  DRAFT: 'draft',                     // مسودة محلية لم تُرسل
  PENDING_LOCAL: 'pending_local',     // محفوظ محلياً ومنتظر دور المعالجة في الـ Outbox
  QUEUED: 'queued',                   // مجدول في طابور الإرسال مع جدول محاولات إعادة
  SYNCING: 'syncing',                 // جارٍ إرساله ومزامنته مع الخادم الآن
  SENT: 'sent',                       // تم تسليمه للخادم وحفظه بنجاح
  DELIVERED: 'delivered',             // وصل لجهاز الفرع/المدير المستلم
  RECEIVED: 'received',               // تم استقباله على جهاز المستقبل
  READ: 'read',                       // تم فتحه وقراءته من قبل المسؤول
  ACKNOWLEDGED: 'acknowledged',       // تم الإقرار به وقيد الدراسة
  IN_PROGRESS: 'in_progress',         // جارٍ تنفيذه (مثل تجهيز إذن أو مراجعة سلفة)
  COMPLETED: 'completed',             // تم اعتماده وتنفيذه بالكامل
  REJECTED: 'rejected',               // تم رفضه مع بيان السبب
  CANCELLED: 'cancelled'              // تم إلغاؤه بواسطة صاحب الطلب
};

// ── مصفوفة التحولات المسموحة لمنع الانتقالات غير الشرعية ─────────────────────
const VALID_TRANSITIONS = {
  [REQUEST_STATES.DRAFT]: [
    REQUEST_STATES.PENDING_LOCAL,
    REQUEST_STATES.CANCELLED
  ],
  [REQUEST_STATES.PENDING_LOCAL]: [
    REQUEST_STATES.QUEUED,
    REQUEST_STATES.SYNCING,
    REQUEST_STATES.SENT,
    REQUEST_STATES.CANCELLED
  ],
  [REQUEST_STATES.QUEUED]: [
    REQUEST_STATES.SYNCING,
    REQUEST_STATES.SENT,
    REQUEST_STATES.CANCELLED
  ],
  [REQUEST_STATES.SYNCING]: [
    REQUEST_STATES.QUEUED, // فشل مؤقت -> إعادة جدولة
    REQUEST_STATES.SENT,
    REQUEST_STATES.COMPLETED,
    REQUEST_STATES.REJECTED
  ],
  [REQUEST_STATES.SENT]: [
    REQUEST_STATES.DELIVERED,
    REQUEST_STATES.RECEIVED,
    REQUEST_STATES.READ,
    REQUEST_STATES.ACKNOWLEDGED,
    REQUEST_STATES.IN_PROGRESS,
    REQUEST_STATES.COMPLETED,
    REQUEST_STATES.REJECTED,
    REQUEST_STATES.CANCELLED
  ],
  [REQUEST_STATES.DELIVERED]: [
    REQUEST_STATES.RECEIVED,
    REQUEST_STATES.READ,
    REQUEST_STATES.ACKNOWLEDGED,
    REQUEST_STATES.IN_PROGRESS,
    REQUEST_STATES.COMPLETED,
    REQUEST_STATES.REJECTED,
    REQUEST_STATES.CANCELLED
  ],
  [REQUEST_STATES.RECEIVED]: [
    REQUEST_STATES.READ,
    REQUEST_STATES.ACKNOWLEDGED,
    REQUEST_STATES.IN_PROGRESS,
    REQUEST_STATES.COMPLETED,
    REQUEST_STATES.REJECTED
  ],
  [REQUEST_STATES.READ]: [
    REQUEST_STATES.ACKNOWLEDGED,
    REQUEST_STATES.IN_PROGRESS,
    REQUEST_STATES.COMPLETED,
    REQUEST_STATES.REJECTED
  ],
  [REQUEST_STATES.ACKNOWLEDGED]: [
    REQUEST_STATES.IN_PROGRESS,
    REQUEST_STATES.COMPLETED,
    REQUEST_STATES.REJECTED
  ],
  [REQUEST_STATES.IN_PROGRESS]: [
    REQUEST_STATES.COMPLETED,
    REQUEST_STATES.REJECTED
  ],
  // الحالات النهائية (Terminal States) لا يمكن التحول منها
  [REQUEST_STATES.COMPLETED]: [],
  [REQUEST_STATES.REJECTED]: [],
  [REQUEST_STATES.CANCELLED]: []
};

/**
 * فحص صلاحية التحول بين الحالات
 */
export function canTransition(fromState, toState) {
  if (!fromState || !toState) return false;
  if (fromState === toState) return true;
  const allowed = VALID_TRANSITIONS[fromState];
  if (!allowed) return false;
  return allowed.includes(toState);
}

/**
 * توليد مفتاح فريد لضمان عدم التكرار (UUID v4 Idempotency Key)
 */
export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * توحيد صيغة الحالات القديمة مع الحالات الجديدة
 */
export function normalizeLifecycleState(status) {
  if (!status) return REQUEST_STATES.PENDING_LOCAL;
  const s = String(status).toLowerCase().trim();

  switch (s) {
    case 'approved':
    case 'completed':
    case 'done':
    case 'executed':
      return REQUEST_STATES.COMPLETED;
    case 'rejected':
    case 'declined':
    case 'refused':
      return REQUEST_STATES.REJECTED;
    case 'cancelled':
    case 'withdrawn':
      return REQUEST_STATES.CANCELLED;
    case 'pending':
    case 'pending_admin':
    case 'pending_branch':
    case 'in_review':
      return REQUEST_STATES.SENT;
    case 'draft':
      return REQUEST_STATES.DRAFT;
    case 'queued':
      return REQUEST_STATES.QUEUED;
    case 'syncing':
      return REQUEST_STATES.SYNCING;
    case 'delivered':
      return REQUEST_STATES.DELIVERED;
    case 'read':
      return REQUEST_STATES.READ;
    case 'acknowledged':
      return REQUEST_STATES.ACKNOWLEDGED;
    case 'in_progress':
      return REQUEST_STATES.IN_PROGRESS;
    default:
      return REQUEST_STATES.SENT;
  }
}

/**
 * بيانات العرض والشارات لكل حالة في الواجهة
 */
export const STATE_CONFIG = {
  [REQUEST_STATES.DRAFT]: {
    label: 'مسودة',
    icon: '📝',
    color: '#6b7280',
    bg: '#f3f4f6',
    border: '#d1d5db'
  },
  [REQUEST_STATES.PENDING_LOCAL]: {
    label: 'محفوظ محلياً (غير متزامن)',
    icon: '💾',
    color: '#d97706',
    bg: '#fef3c7',
    border: '#fde68a'
  },
  [REQUEST_STATES.QUEUED]: {
    label: 'في طابور الإرسال',
    icon: '⏳',
    color: '#b45309',
    bg: '#fef3c7',
    border: '#f59e0b'
  },
  [REQUEST_STATES.SYNCING]: {
    label: 'جارٍ المزامنة...',
    icon: '🔄',
    color: '#2563eb',
    bg: '#dbeafe',
    border: '#93c5fd'
  },
  [REQUEST_STATES.SENT]: {
    label: 'تم الإرسال (في انتظار المراجعة)',
    icon: '📤',
    color: '#0284c7',
    bg: '#e0f2fe',
    border: '#7dd3fc'
  },
  [REQUEST_STATES.DELIVERED]: {
    label: 'تم التسليم للإدارة',
    icon: '📬',
    color: '#0891b2',
    bg: '#cffafe',
    border: '#67e8f9'
  },
  [REQUEST_STATES.RECEIVED]: {
    label: 'تم الاستلام',
    icon: '📥',
    color: '#0d9488',
    bg: '#ccfbf1',
    border: '#5eead4'
  },
  [REQUEST_STATES.READ]: {
    label: 'تمت القراءة',
    icon: '👁️',
    color: '#4f46e5',
    bg: '#e0e7ff',
    border: '#a5b4fc'
  },
  [REQUEST_STATES.ACKNOWLEDGED]: {
    label: 'قيد المراجعة والدراسة',
    icon: '🔍',
    color: '#7c3aed',
    bg: '#ede9fe',
    border: '#c4b5fd'
  },
  [REQUEST_STATES.IN_PROGRESS]: {
    label: 'جارٍ التنفيذ',
    icon: '⚙️',
    color: '#d97706',
    bg: '#fef3c7',
    border: '#fcd34d'
  },
  [REQUEST_STATES.COMPLETED]: {
    label: 'معتمد ومكتمل',
    icon: '✅',
    color: '#059669',
    bg: '#d1fae5',
    border: '#6ee7b7'
  },
  [REQUEST_STATES.REJECTED]: {
    label: 'مرفوض',
    icon: '❌',
    color: '#dc2626',
    bg: '#fee2e2',
    border: '#fca5a5'
  },
  [REQUEST_STATES.CANCELLED]: {
    label: 'ملغي',
    icon: '🚫',
    color: '#9ca3af',
    bg: '#f3f4f6',
    border: '#e5e7eb'
  }
};

/**
 * الحصول على شارة الحالة مع الأيقونة واللون
 */
export function getLifecycleBadge(status) {
  const normalized = normalizeLifecycleState(status);
  return STATE_CONFIG[normalized] || STATE_CONFIG[REQUEST_STATES.SENT];
}
