/**
 * stateMerger.js
 * دمج ذكي ثنائي وثلاثي الأطراف لحالات التطبيق لمنع مسح أو تداخل البيانات بين الأجهزة المتزامنة
 * مع دعم الحذف النهائي وحظر استرجاع الكيانات المحذوفة (Tombstone & Diff Deletion Tracking)
 */

// استخراج مفتاح فريد للعنصر
export function getItemKey(item, fallbackPrefix = 'item') {
  if (!item || typeof item !== 'object') return null;
  if (item.id !== undefined && item.id !== null && item.id !== '') return String(item.id);
  if (item._id !== undefined && item._id !== null && item._id !== '') return String(item._id);
  if (item.requestId !== undefined && item.requestId !== null && item.requestId !== '') return String(item.requestId);
  if (item.deviceId) return String(item.deviceId);
  if (fallbackPrefix === 'branch' && item.branchCode) return `branch_${item.branchCode}`;
  if (fallbackPrefix === 'emp' && item.code) return `emp_${item.code}`;
  if (item.employeeId && item.date) {
    const sub = item.type || item.action || item.subType || item.time || item.createdAt || item.startTime || item.startDate || '';
    return `${fallbackPrefix}_${item.employeeId}_${item.date}_${sub}`;
  }
  if (item.timestamp) return `${fallbackPrefix}_${item.timestamp}`;
  if (item.createdAt) return `${fallbackPrefix}_${item.createdAt}`;
  try {
    return JSON.stringify(item);
  } catch {
    return `${fallbackPrefix}_${Math.random()}`;
  }
}

// استخراج أحدث وقت تعديل للعنصر
export function getItemTime(item) {
  if (!item) return 0;
  const timeVal = item.updatedAt || item.approvedAt || item.rejectedAt || item.createdAt || item.timestamp || item.date;
  if (!timeVal) return 0;
  if (typeof timeVal === 'number') return timeVal;
  const parsed = new Date(timeVal).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

export function toSafeArray(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') {
    return Object.values(val).filter((item) => item !== null && typeof item === 'object');
  }
  return [];
}

/**
 * فحص ما إذا كان العنصر محذوفاً نهائياً بشكل دقيق لمنع الحذف الخاطئ للطلبات الجديدة
 */
export function isItemDeleted(item, key, deletedIds) {
  if (!item || typeof item !== 'object') return true;
  if (!deletedIds || !(deletedIds instanceof Set) || deletedIds.size === 0) return false;

  // فحص مباشر للمفتاح المحدد
  if (key && deletedIds.has(key)) return true;

  if (item.id !== undefined && item.id !== null && item.id !== '') {
    const idStr = String(item.id);
    if (deletedIds.has(idStr)) return true;
  }

  // Device-specific deletion check
  if (item.deviceId && (deletedIds.has(String(item.deviceId)) || deletedIds.has(`dev_${item.deviceId}`))) return true;

  return false;
}

// دمج مصفوفتين حسب المفتاح الفريد وحسم التعارضات مع مراعاة العناصر المحذوفة نهائياً
export function mergeArrays(localArr = [], remoteArr = [], options = {}) {
  const localList = toSafeArray(localArr);
  const remoteList = toSafeArray(remoteArr);
  const deletedIds = options.deletedIds instanceof Set ? options.deletedIds : new Set(toSafeArray(options.deletedIds).map(String));

  const map = new Map();

  // 1. إضافة كل عناصر السحابة (Remote) ما لم تكن محذوفة
  for (const item of remoteList) {
    if (!item || typeof item !== 'object') continue;
    const key = getItemKey(item, options.prefix || 'rem');
    if (key && !isItemDeleted(item, key, deletedIds)) {
      map.set(key, item);
    }
  }

  // 2. دمج عناصر الجهاز المحلي (Local)
  for (const item of localList) {
    if (!item || typeof item !== 'object') continue;
    const key = getItemKey(item, options.prefix || 'loc');
    if (!key || isItemDeleted(item, key, deletedIds)) continue;

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

  // 0. معالجة وحسم الموظفين والصلاحيات الصارمة
  if (options.prefix === 'emp') {
    const localTime = getItemTime(localItem);
    const remoteTime = getItemTime(remoteItem);
    let mergedEmp = {};
    if (remoteTime > localTime) {
      mergedEmp = { ...localItem, ...remoteItem };
    } else if (localTime > remoteTime) {
      mergedEmp = { ...remoteItem, ...localItem };
    } else {
      mergedEmp = { ...remoteItem, ...localItem };
      if (localItem.permissions !== undefined) {
        mergedEmp.permissions = localItem.permissions;
      } else if (remoteItem.permissions !== undefined) {
        mergedEmp.permissions = remoteItem.permissions;
      }
    }
    return mergedEmp;
  }

  // 1. معالجة وحسم سجلات السداد والمدفوعات للسلف
  let mergedPaymentsHistory = undefined;
  let mergedPaidAmount = undefined;
  if (Array.isArray(localItem.paymentsHistory) || Array.isArray(remoteItem.paymentsHistory) || localItem.paidAmount !== undefined || remoteItem.paidAmount !== undefined) {
    const pLocal = Array.isArray(localItem.paymentsHistory) ? localItem.paymentsHistory : [];
    const pRemote = Array.isArray(remoteItem.paymentsHistory) ? remoteItem.paymentsHistory : [];
    const payMap = new Map();
    [...pRemote, ...pLocal].forEach((p) => {
      if (p && typeof p === 'object') {
        const pKey = p.id || `${p.date}_${p.amount}_${p.paidAt || ''}`;
        payMap.set(pKey, p);
      }
    });
    mergedPaymentsHistory = Array.from(payMap.values());
    const totalFromHistory = mergedPaymentsHistory.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
    mergedPaidAmount = Math.max(
      parseFloat(localItem.paidAmount) || 0,
      parseFloat(remoteItem.paidAmount) || 0,
      totalFromHistory
    );
  }

  // 2. معالجة وحسم بصمات الوجه والأجهزة البيومترية
  let mergedBiometrics = undefined;
  if (localItem.biometrics || remoteItem.biometrics) {
    mergedBiometrics = {
      ...(remoteItem.biometrics || {}),
      ...(localItem.biometrics || {})
    };
  }

  // 3. معالجة قائمة الأجهزة المسجلة للموظف
  let mergedDevices = undefined;
  if (Array.isArray(localItem.devices) || Array.isArray(remoteItem.devices)) {
    const devMap = new Map();
    [...(remoteItem.devices || []), ...(localItem.devices || [])].forEach((d) => {
      if (d && typeof d === 'object') {
        const dKey = d.deviceId || d.id;
        if (dKey) devMap.set(dKey, d);
      }
    });
    mergedDevices = Array.from(devMap.values());
  }

  // 4. حسم التعارض العام بناءً على أحدث توقيت تعديل
  const localTime = getItemTime(localItem);
  const remoteTime = getItemTime(remoteItem);

  let mergedBase = localTime >= remoteTime
    ? { ...remoteItem, ...localItem }
    : { ...localItem, ...remoteItem };

  if (mergedPaymentsHistory !== undefined) mergedBase.paymentsHistory = mergedPaymentsHistory;
  if (mergedPaidAmount !== undefined) mergedBase.paidAmount = mergedPaidAmount;
  if (mergedBiometrics !== undefined) mergedBase.biometrics = mergedBiometrics;
  if (mergedDevices !== undefined) mergedBase.devices = mergedDevices;

  // 5. حماية حالة الاعتماد والسداد للسلف والطلبات من الارتداد لحالة معلقة
  if (options.prefix === 'loan' || options.prefix === 'req') {
    const isApprovedOrPaid = localItem.adminApproved === true || remoteItem.adminApproved === true ||
                             localItem.status === 'approved' || remoteItem.status === 'approved' ||
                             localItem.status === 'paid' || remoteItem.status === 'paid' ||
                             localItem.status === 'partial' || remoteItem.status === 'partial' ||
                             (mergedPaidAmount !== undefined && mergedPaidAmount > 0);

    if (isApprovedOrPaid) {
      mergedBase.adminApproved = true;
      const totalAmt = parseFloat(mergedBase.amount || mergedBase.totalAmount) || 0;
      const paid = mergedPaidAmount !== undefined ? mergedPaidAmount : (parseFloat(mergedBase.paidAmount) || 0);
      if (paid >= totalAmt && totalAmt > 0) {
        mergedBase.status = 'paid';
      } else if (paid > 0) {
        mergedBase.status = 'partial';
      } else if (localItem.status === 'approved' || remoteItem.status === 'approved' || mergedBase.status === 'pending') {
        mergedBase.status = 'approved';
      }
    }
  }

  return mergedBase;
}

// دمج جداول الشفتات (Rosters)
export function mergeRosters(localRosters = [], remoteRosters = [], options = {}) {
  const localList = toSafeArray(localRosters);
  const remoteList = toSafeArray(remoteRosters);
  const deletedIds = options.deletedIds instanceof Set ? options.deletedIds : new Set(toSafeArray(options.deletedIds).map(String));

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
    if (!isItemDeleted(r, key, deletedIds)) {
      map.set(key, r);
    }
  }

  for (const r of localList) {
    if (!r || typeof r !== 'object') continue;
    const key = getRosterKey(r);
    if (!key || isItemDeleted(r, key, deletedIds)) continue;

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

// دمج الشفتات النشطة (activeShifts) مع منع استعادة الشفتات المنتهية أو المحذوفة
export function mergeActiveShifts(localShifts = {}, remoteShifts = {}, mergedShifts = [], options = {}) {
  const local = typeof localShifts === 'object' && localShifts && !Array.isArray(localShifts) ? localShifts : {};
  const remote = typeof remoteShifts === 'object' && remoteShifts && !Array.isArray(remoteShifts) ? remoteShifts : {};
  const deletedIds = options.deletedIds instanceof Set ? options.deletedIds : new Set(toSafeArray(options.deletedIds).map(String));

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
    if (deletedIds.has(String(empId)) || deletedIds.has(`emp_${empId}`)) continue;
    const act = local[empId];
    if (!act || !act.date) continue;
    const sig = `${String(empId)}_${act.date}_${act.timeIn}`;
    if (!closedShiftSignatures.has(sig)) {
      merged[empId] = act;
    }
  }

  // 2. دمج الشفتات النشطة من السحابة إذا لم تكن مسجلة كانصراف مكتمل أو محذوفة
  for (const empId of Object.keys(remote)) {
    if (deletedIds.has(String(empId)) || deletedIds.has(`emp_${empId}`)) continue;
    const act = remote[empId];
    if (!act || !act.date) continue;
    const sig = `${String(empId)}_${act.date}_${act.timeIn}`;
    if (closedShiftSignatures.has(sig)) continue;

    if (!merged[empId]) {
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

  // تجميع كافة شواهد القبور والمعرفات المحذوفة صراحة من الطرفين
  const deletedIds = new Set([
    ...toSafeArray(localState._deletedIds || []).map(String),
    ...toSafeArray(remoteState._deletedIds || []).map(String)
  ]);

  const mergedShifts = mergeArrays(localState.shifts, remoteState.shifts, { prefix: 'shift', deletedIds });

  return {
    ...remoteState,
    ...localState,

    // 1. الإعدادات واللائحة
    orgSettings: (() => {
      const localSettings = localState.orgSettings || {};
      const remoteSettings = remoteState.orgSettings || {};
      const localTime = getItemTime(localSettings);
      const remoteTime = getItemTime(remoteSettings);
      
      let mergedSettings = {};
      if (remoteTime > localTime) {
        mergedSettings = { ...localSettings, ...remoteSettings };
      } else if (localTime > remoteTime) {
        mergedSettings = { ...remoteSettings, ...localSettings };
      } else {
        mergedSettings = { ...localSettings, ...remoteSettings };
        if (remoteSettings.permissions !== undefined) {
          mergedSettings.permissions = remoteSettings.permissions;
        } else if (localSettings.permissions !== undefined) {
          mergedSettings.permissions = localSettings.permissions;
        }
        
        if (remoteSettings.empPermissions !== undefined) {
          mergedSettings.empPermissions = remoteSettings.empPermissions;
        } else if (localSettings.empPermissions !== undefined) {
          mergedSettings.empPermissions = localSettings.empPermissions;
        }
      }

      // دمج عميق لأقفال المالك لضمان عدم فقدان أي قفل عند التزامن
      mergedSettings.ownerModificationLocks = {
        ...(localSettings.ownerModificationLocks || {}),
        ...(remoteSettings.ownerModificationLocks || {})
      };

      return mergedSettings;
    })(),
    bylaws: {
      ...(remoteState.bylaws || {}),
      ...(localState.bylaws || {})
    },
    bylawsSections: (() => {
      const localT = new Date(localState.bylawsUpdatedAt || 0).getTime();
      const remoteT = new Date(remoteState.bylawsUpdatedAt || 0).getTime();
      if (localT > remoteT && Array.isArray(localState.bylawsSections) && localState.bylawsSections.length > 0) {
        return localState.bylawsSections;
      }
      if (Array.isArray(remoteState.bylawsSections) && remoteState.bylawsSections.length > 0) {
        return remoteState.bylawsSections;
      }
      return localState.bylawsSections || remoteState.bylawsSections || undefined;
    })(),
    bylawsText: (() => {
      const localT = new Date(localState.bylawsUpdatedAt || 0).getTime();
      const remoteT = new Date(remoteState.bylawsUpdatedAt || 0).getTime();
      if (localT > remoteT && localState.bylawsText) return localState.bylawsText;
      return remoteState.bylawsText || localState.bylawsText || undefined;
    })(),
    bylawsUpdatedAt: localState.bylawsUpdatedAt || remoteState.bylawsUpdatedAt || undefined,
    ipRestrictions: {
      ...(remoteState.ipRestrictions || {}),
      ...(localState.ipRestrictions || {})
    },

    // 2. الكيانات والمصفوفات الأساسية
    branches: mergeArrays(localState.branches, remoteState.branches, { prefix: 'branch', deletedIds }),
    employees: mergeArrays(localState.employees, remoteState.employees, { prefix: 'emp', deletedIds }),
    shifts: mergedShifts,
    approvalRules: (() => {
      if (localState._approvalRulesUpdatedAt || remoteState._approvalRulesUpdatedAt) {
        const localT = new Date(localState._approvalRulesUpdatedAt || 0).getTime();
        const remoteT = new Date(remoteState._approvalRulesUpdatedAt || 0).getTime();
        return localT >= remoteT ? (localState.approvalRules || []) : (remoteState.approvalRules || []);
      }
      return localState.approvalRules && localState.approvalRules.length > 0 
        ? localState.approvalRules 
        : (remoteState.approvalRules || []);
    })(),
    authorizedDevices: mergeArrays(localState.authorizedDevices, remoteState.authorizedDevices, { prefix: 'dev', deletedIds }),

    requests: mergeArrays(localState.requests, remoteState.requests, { prefix: 'req', deletedIds }),
    resignationRequests: mergeArrays(localState.resignationRequests, remoteState.resignationRequests, { prefix: 'res', deletedIds }),
    leaveRequests: mergeArrays(localState.leaveRequests, remoteState.leaveRequests, { prefix: 'leave', deletedIds }),
    leaveHistory: mergeArrays(localState.leaveHistory, remoteState.leaveHistory, { prefix: 'lhist', deletedIds }),
    shiftSwaps: mergeArrays(localState.shiftSwaps, remoteState.shiftSwaps, { prefix: 'swap', deletedIds }),
    loans: mergeArrays(localState.loans, remoteState.loans, { prefix: 'loan', deletedIds }),
    logs: mergeArrays(localState.logs, remoteState.logs, { prefix: 'log', deletedIds }),
    evaluations: mergeArrays(localState.evaluations, remoteState.evaluations, { prefix: 'eval', deletedIds }),
    notifications: (() => {
      let list = mergeArrays(localState.notifications, remoteState.notifications, { prefix: 'notif', deletedIds });
      const clearedAt = localState._notificationsClearedAt || remoteState._notificationsClearedAt;
      if (clearedAt) {
        const clearTime = new Date(clearedAt).getTime();
        list = list.filter((n) => {
          const t = n.createdAt || n.timestamp || n.date;
          if (!t) return false;
          const nTime = new Date(t).getTime();
          return !isNaN(nTime) && nTime > clearTime;
        });
      }
      return list;
    })(),
    adjustments: mergeArrays(localState.adjustments, remoteState.adjustments, { prefix: 'adj', deletedIds }),
    lateIncidents: mergeArrays(localState.lateIncidents, remoteState.lateIncidents, { prefix: 'late_inc', deletedIds }),
    employeeNotes: mergeArrays(localState.employeeNotes, remoteState.employeeNotes, { prefix: 'note', deletedIds }),
    finances: mergeArrays(localState.finances, remoteState.finances, { prefix: 'fin', deletedIds }),
    transactions: mergeArrays(localState.transactions, remoteState.transactions, { prefix: 'tx', deletedIds }),

    recruitmentApplications: mergeArrays(localState.recruitmentApplications, remoteState.recruitmentApplications, { prefix: 'app', deletedIds }),
    jobVacancies: mergeArrays(localState.jobVacancies, remoteState.jobVacancies, { prefix: 'vac', deletedIds }),
    rosters: mergeRosters(localState.rosters, remoteState.rosters, { deletedIds }),
    activeShifts: mergeActiveShifts(localState.activeShifts, remoteState.activeShifts, mergedShifts, { deletedIds }),
    _notificationsClearedAt: localState._notificationsClearedAt || remoteState._notificationsClearedAt || null,
    _deletedIds: Array.from(deletedIds).slice(-3000)
  };
}
