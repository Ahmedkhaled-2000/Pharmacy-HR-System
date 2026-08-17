/**
 * stateMerger.js
 * دمج ذكي ثنائي وثلاثي الأطراف لحالات التطبيق لمنع مسح أو تداخل البيانات بين الأجهزة المتزامنة
 */

// استخراج مفتاح فريد للعنصر
function getItemKey(item, fallbackPrefix = 'item') {
  if (!item || typeof item !== 'object') return null;
  if (item.id !== undefined && item.id !== null && item.id !== '') return String(item.id);
  if (item.deviceId) return String(item.deviceId);
  if (item.code) return String(item.code);
  if (item.employeeId && item.date) {
    return `${item.employeeId}_${item.date}_${item.type || item.action || item.subType || ''}_${item.time || ''}`;
  }
  if (item.timestamp) return `${fallbackPrefix}_${item.timestamp}`;
  return JSON.stringify(item);
}

// استخراج أحدث وقت تعديل للعنصر
function getItemTime(item) {
  if (!item) return 0;
  const timeVal = item.updatedAt || item.approvedAt || item.rejectedAt || item.createdAt || item.timestamp || item.date;
  if (!timeVal) return 0;
  if (typeof timeVal === 'number') return timeVal;
  const parsed = new Date(timeVal).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

function toSafeArray(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') {
    return Object.values(val).filter((item) => item !== null && typeof item === 'object');
  }
  return [];
}

// دمج مصفوفتين حسب المفتاح الفريد وحسم التعارضات مع مراعاة العناصر المحذوفة نهائياً
export function mergeArrays(localArr = [], remoteArr = [], options = {}) {
  const localList = toSafeArray(localArr);
  const remoteList = toSafeArray(remoteArr);
  const deletedIds = options.deletedIds instanceof Set ? options.deletedIds : new Set(options.deletedIds || []);

  const map = new Map();

  // 1. إضافة كل عناصر السحابة (Remote) ما لم تكن محذوفة
  for (const item of remoteList) {
    if (!item || typeof item !== 'object') continue;
    const key = getItemKey(item, options.prefix || 'rem');
    if (key && !deletedIds.has(key) && !deletedIds.has(String(item.id))) {
      map.set(key, item);
    }
  }

  // 2. دمج عناصر الجهاز المحلي (Local)
  for (const item of localList) {
    if (!item || typeof item !== 'object') continue;
    const key = getItemKey(item, options.prefix || 'loc');
    if (!key || deletedIds.has(key) || deletedIds.has(String(item.id))) continue;

    if (!map.has(key)) {
      // عنصر جديد غير موجود في السحابة أضيف محلياً -> الحفاظ عليه
      map.set(key, item);
    } else {
      // العنصر موجود في الطرفين -> حسم التعارض بذكاء
      const remoteItem = map.get(key);
      const mergedItem = resolveItemConflict(item, remoteItem, options);
      map.set(key, mergedItem);
    }
  }

  return Array.from(map.values());
}

// حسم التعارض بين نسختين من نفس العنصر
function resolveItemConflict(localItem, remoteItem, options = {}) {
  if (!localItem) return remoteItem;
  if (!remoteItem) return localItem;

  // 1. معالجة وحسم سجلات السداد والمدفوعات للسلف
  let mergedPaymentsHistory = undefined;
  let mergedPaidAmount = undefined;
  if (Array.isArray(localItem.paymentsHistory) || Array.isArray(remoteItem.paymentsHistory) || localItem.paidAmount !== undefined || remoteItem.paidAmount !== undefined) {
    mergedPaymentsHistory = mergeArrays(localItem.paymentsHistory || [], remoteItem.paymentsHistory || [], { prefix: 'pay' });
    const localPaid = parseFloat(localItem.paidAmount) || 0;
    const remotePaid = parseFloat(remoteItem.paidAmount) || 0;
    mergedPaidAmount = Math.max(localPaid, remotePaid);
  }

  // 2. دمج الرسائل والردود الفرعية في حالة الشكاوى أو الملاحظات (replies / comments)
  let mergedReplies = undefined;
  if (Array.isArray(localItem.replies) || Array.isArray(remoteItem.replies)) {
    mergedReplies = mergeArrays(localItem.replies || [], remoteItem.replies || [], { prefix: 'rep' });
  }

  // 3. أولوية حالة الاعتماد/الرفض والسداد:
  const statusRanks = {
    pending: 10,
    pending_admin: 15,
    rejected: 30,
    cancelled: 30,
    canceled: 30,
    approved: 40,
    partial: 50,
    paid: 60,
    completed: 60,
    closed: 60
  };

  const localRank = statusRanks[localItem.status] || 0;
  const remoteRank = statusRanks[remoteItem.status] || 0;

  // 4. مقارنة التوقيت الزمني للأحدث
  const localTime = getItemTime(localItem);
  const remoteTime = getItemTime(remoteItem);

  let baseWinner;
  if (localRank !== remoteRank && (localRank >= 30 || remoteRank >= 30)) {
    baseWinner = localRank >= remoteRank ? { ...remoteItem, ...localItem } : { ...localItem, ...remoteItem };
  } else {
    baseWinner = remoteTime > localTime ? { ...localItem, ...remoteItem } : { ...remoteItem, ...localItem };
  }

  if (mergedReplies) {
    baseWinner.replies = mergedReplies;
  }
  if (mergedPaymentsHistory) {
    baseWinner.paymentsHistory = mergedPaymentsHistory;
  }
  if (mergedPaidAmount !== undefined) {
    baseWinner.paidAmount = mergedPaidAmount;
    const totalAmount = parseFloat(baseWinner.amount || baseWinner.totalAmount) || 0;
    if (mergedPaidAmount >= totalAmount && totalAmount > 0) {
      baseWinner.status = 'paid';
    } else if (mergedPaidAmount > 0) {
      baseWinner.status = 'partial';
    }
  }

  return baseWinner;
}

// دمج جداول الشفتات (Rosters)
export function mergeRosters(localRosters = [], remoteRosters = []) {
  const localList = toSafeArray(localRosters);
  const remoteList = toSafeArray(remoteRosters);

  const getRosterKey = (r) => {
    if (!r || typeof r !== 'object') return null;
    if (r.id) return String(r.id);
    if (r.employeeId && r.month) return `${r.employeeId}_${r.month}`;
    return null;
  };

  const map = new Map();

  for (const r of remoteList) {
    if (!r || typeof r !== 'object') continue;
    const key = getRosterKey(r) || `ros_${Math.random()}`;
    map.set(key, r);
  }

  for (const r of localList) {
    if (!r || typeof r !== 'object') continue;
    const key = getRosterKey(r);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, r);
    } else {
      const remoteRoster = map.get(key);
      const mergedSchedule = {
        ...(remoteRoster.schedule || {}),
        ...(r.schedule || {})
      };
      const mergedRoster = {
        ...remoteRoster,
        ...r,
        schedule: mergedSchedule
      };
      map.set(key, mergedRoster);
    }
  }

  return Array.from(map.values());
}

// دمج الشفتات النشطة (activeShifts) مع منع استعادة الشفتات المنتهية
export function mergeActiveShifts(localShifts = {}, remoteShifts = {}, mergedShifts = []) {
  const local = typeof localShifts === 'object' && localShifts && !Array.isArray(localShifts) ? localShifts : {};
  const remote = typeof remoteShifts === 'object' && remoteShifts && !Array.isArray(remoteShifts) ? remoteShifts : {};

  // بناء مجموعة لتواقيع الشفتات المكتملة والمغلقة
  const closedShiftSignatures = new Set();
  if (Array.isArray(mergedShifts)) {
    for (const s of mergedShifts) {
      if (s && s.employeeId && s.date && s.timeIn && (s.timeOut || s.hours !== undefined)) {
        closedShiftSignatures.add(`${String(s.employeeId)}_${s.date}_${s.timeIn}`);
      }
    }
  }

  const merged = {};

  // 1. فحص الشفتات النشطة المحلية أولاً (الأولوية لإجراءات الجهاز المحلي)
  for (const empId of Object.keys(local)) {
    const act = local[empId];
    if (!act || !act.date) continue;
    const sig = `${String(empId)}_${act.date}_${act.timeIn}`;
    if (!closedShiftSignatures.has(sig)) {
      merged[empId] = act;
    }
  }

  // 2. دمج الشفتات النشطة من السحابة إذا لم تكن مسجلة كانصراف مكتمل
  for (const empId of Object.keys(remote)) {
    const act = remote[empId];
    if (!act || !act.date) continue;
    const sig = `${String(empId)}_${act.date}_${act.timeIn}`;
    if (closedShiftSignatures.has(sig)) continue;

    if (!merged[empId]) {
      // التحقق مما إذا كان هناك شفت أحدث لنفس اليوم محفوظ بالفعل
      const hasClosedShiftAfter = Array.isArray(mergedShifts) && mergedShifts.some(
        s => String(s.employeeId) === String(empId) && s.date === act.date && s.timeIn >= act.timeIn
      );
      if (!hasClosedShiftAfter) {
        merged[empId] = act;
      }
    } else {
      const localTime = getItemTime(local[empId]);
      const remoteTime = getItemTime(remote[empId]);
      merged[empId] = localTime >= remoteTime ? local[empId] : remote[empId];
    }
  }

  return merged;
}

// دمج شامل وذكي لكامل كائن الحالة (Full State Smart Merge)
export function smartMergeStates(localState, remoteState) {
  if (!remoteState || typeof remoteState !== 'object') return localState;
  if (!localState || typeof localState !== 'object') return remoteState;

  const deletedIds = new Set([
    ...toSafeArray(localState._deletedIds || []),
    ...toSafeArray(remoteState._deletedIds || [])
  ]);

  const mergedShifts = mergeArrays(localState.shifts, remoteState.shifts, { prefix: 'shift', deletedIds });

  return {
    ...remoteState,
    ...localState,

    // 1. الإعدادات واللائحة
    orgSettings: {
      ...(remoteState.orgSettings || {}),
      ...(localState.orgSettings || {})
    },
    bylaws: {
      ...(remoteState.bylaws || {}),
      ...(localState.bylaws || {})
    },
    ipRestrictions: {
      ...(remoteState.ipRestrictions || {}),
      ...(localState.ipRestrictions || {})
    },

    // 2. الكيانات والمصفوفات الأساسية
    branches: mergeArrays(localState.branches, remoteState.branches, { prefix: 'branch', deletedIds }),
    employees: mergeArrays(localState.employees, remoteState.employees, { prefix: 'emp', deletedIds }),
    shifts: mergedShifts,
    approvalRules: mergeArrays(localState.approvalRules, remoteState.approvalRules, { prefix: 'rule', deletedIds }),
    authorizedDevices: mergeArrays(localState.authorizedDevices, remoteState.authorizedDevices, { prefix: 'dev', deletedIds }),

    // 3. المعاملات والطلبات والحضور
    requests: mergeArrays(localState.requests, remoteState.requests, { prefix: 'req', deletedIds }),
    leaveRequests: mergeArrays(localState.leaveRequests, remoteState.leaveRequests, { prefix: 'leave', deletedIds }),
    shiftSwaps: mergeArrays(localState.shiftSwaps, remoteState.shiftSwaps, { prefix: 'swap', deletedIds }),
    loans: mergeArrays(localState.loans, remoteState.loans, { prefix: 'loan', deletedIds }),
    logs: mergeArrays(localState.logs, remoteState.logs, { prefix: 'log', deletedIds }),
    evaluations: mergeArrays(localState.evaluations, remoteState.evaluations, { prefix: 'eval', deletedIds }),
    notifications: mergeArrays(localState.notifications, remoteState.notifications, { prefix: 'notif', deletedIds }),
    adjustments: mergeArrays(localState.adjustments, remoteState.adjustments, { prefix: 'adj', deletedIds }),
    employeeNotes: mergeArrays(localState.employeeNotes, remoteState.employeeNotes, { prefix: 'note', deletedIds }),
    finances: mergeArrays(localState.finances, remoteState.finances, { prefix: 'fin', deletedIds }),
    transactions: mergeArrays(localState.transactions, remoteState.transactions, { prefix: 'tx', deletedIds }),

    // 4. الجداول والشفتات وقائمة المحذوفات
    rosters: mergeRosters(localState.rosters, remoteState.rosters),
    activeShifts: mergeActiveShifts(localState.activeShifts, remoteState.activeShifts, mergedShifts),
    _deletedIds: Array.from(deletedIds).slice(-1000)
  };
}
