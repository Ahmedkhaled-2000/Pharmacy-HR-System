/**
 * stateMerger.js
 * دمج ذكي ثنائي وثلاثي الأطراف لحالات التطبيق لمنع مسح أو تداخل البيانات بين الأجهزة المتزامنة
 * مع دعم الحذف النهائي وحظر استرجاع الكيانات المحذوفة (Tombstone & Diff Deletion Tracking)
 */

// استخراج مفتاح فريد للعنصر
export function getItemKey(item, fallbackPrefix = 'item') {
  if (!item || typeof item !== 'object') return null;
  // المعرف الأساسي id له الأولوية المطلقة لضمان ثبات هوية الكيان حتى عند تعديل الكود أو الاسم أو الهاتف
  if (item.id !== undefined && item.id !== null && item.id !== '') return String(item.id);
  if (item._id !== undefined && item._id !== null && item._id !== '') return String(item._id);

  // للموظفين في حال غياب id: الكود أو الرقم القومي يحدد الشخص بشكل احتياطي
  if (fallbackPrefix === 'emp') {
    if (item.code) return `emp_code_${String(item.code).trim().toLowerCase()}`;
    if (item.nationalId) {
      const nid = String(item.nationalId).replace(/\D/g, '');
      if (nid) return `emp_nid_${nid}`;
    }
    if (item.recruitmentApplicationId) return `emp_rec_${String(item.recruitmentApplicationId)}`;
  }
  if (item.requestId !== undefined && item.requestId !== null && item.requestId !== '') {
    return fallbackPrefix === 'req' ? String(item.requestId) : `${fallbackPrefix}_req_${item.requestId}`;
  }
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
  const timeVal =
    item.updatedAt ||
    item.updated_at ||
    item.reinstatedAt ||
    item.terminatedAt ||
    item.approvedAt ||
    item.rejectedAt ||
    item.createdAt ||
    item.created_at ||
    item.timestamp ||
    item.date ||
    item.driveLastSyncAt;
  if (!timeVal) return 0;
  if (typeof timeVal === 'number') return timeVal;
  const parsed = new Date(timeVal).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

export function toSafeArray(val) {
  if (Array.isArray(val)) {
    return val.filter((item) => item !== null && item !== undefined);
  }
  if (val && typeof val === 'object') {
    return Object.values(val).filter((item) => item !== null && item !== undefined);
  }
  return [];
}

/**
 * فحص ما إذا كان العنصر محذوفاً نهائياً بشكل دقيق لمنع الحذف الخاطئ للطلبات الجديدة والموظفين النشطين
 * يعتمد على عزل البادئات (Prefix Isolation) لمنع تداخل أرقام الحركات مع أكواد الموظفين
 */
export function isItemDeleted(item, key, deletedIds, options = {}) {
  if (!item || typeof item !== 'object') return true;
  if (!deletedIds || !(deletedIds instanceof Set) || deletedIds.size === 0) return false;

  const prefix = options.prefix || '';

  // 1. حماية قصوى وعزل تام للموظفين (Employee Prefix Isolation)
  // لا يجوز إطلاقاً حذف موظف بسبب رقم مجرد مثل '1' أو '2' أو '103' قادم من حذف شفت أو حركة مالية
  if (prefix === 'emp') {
    const idStr = item.id ? String(item.id).trim() : '';
    const idLower = idStr.toLowerCase();
    if (idStr) {
      if ((idStr.startsWith('emp_') || /[a-z_-]/i.test(idStr)) && (deletedIds.has(idStr) || deletedIds.has(idLower))) return true;
      if (deletedIds.has(`emp_${idStr}`) || deletedIds.has(`emp_${idLower}`) || deletedIds.has(`emp_del_${idStr}`)) return true;
    }
    if (item._id) {
      const _idStr = String(item._id).trim();
      const _idLower = _idStr.toLowerCase();
      if ((_idStr.startsWith('emp_') || /[a-z_-]/i.test(_idStr)) && (deletedIds.has(_idStr) || deletedIds.has(_idLower))) return true;
      if (deletedIds.has(`emp_${_idStr}`) || deletedIds.has(`emp_${_idLower}`)) return true;
    }
    if (item.code !== undefined && item.code !== null && item.code !== '') {
      const codeStr = String(item.code).trim().toLowerCase();
      if (deletedIds.has(`emp_code_${codeStr}`) || deletedIds.has(`emp_${codeStr}`)) return true;
    }
    if (item.username !== undefined && item.username !== null && item.username !== '') {
      const uStr = String(item.username).trim().toLowerCase();
      if (deletedIds.has(`emp_user_${uStr}`) || deletedIds.has(`emp_${uStr}`) || deletedIds.has(`user_${uStr}`)) return true;
    }
    if (item.nationalId !== undefined && item.nationalId !== null && item.nationalId !== '') {
      const nid = String(item.nationalId).replace(/\D/g, '');
      if (nid && (deletedIds.has(`emp_nid_${nid}`) || deletedIds.has(`nid_${nid}`))) return true;
    }
    // الحصانة الذاتية: الموظف لا يُحذف برقم مجرد إطلاقاً
    return false;
  }

  // 2. فحص طلبات التوظيف (Recruitment Applications)
  if (prefix === 'app') {
    const idStr = item.id ? String(item.id).trim() : '';
    const idLower = idStr.toLowerCase();
    if (idStr && (deletedIds.has(idStr) || deletedIds.has(idLower) || deletedIds.has(`app_${idStr}`) || deletedIds.has(`app_${idLower}`))) return true;
    if (item.code) {
      const codeStr = String(item.code).trim().toLowerCase();
      if (deletedIds.has(codeStr) || deletedIds.has(`app_${codeStr}`) || deletedIds.has(`app_code_${codeStr}`)) return true;
    }
    return false;
  }

  // 3. فحص مباشر للمفتاح المحدد
  if (key) {
    const kStr = String(key);
    if (deletedIds.has(kStr) || deletedIds.has(kStr.toLowerCase())) return true;
  }

  // 4. فحص المعرف الأساسي id و _id للكائنات العامة
  if (item.id !== undefined && item.id !== null && item.id !== '') {
    const idStr = String(item.id).trim();
    const idLower = idStr.toLowerCase();
    const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|notif_|shift_|punch_|adj_|late_inc_|medreq_|disc_|perm_|lhist_|obj_inc_|obj_adj_|obj_req_)/, '');
    if (deletedIds.has(idStr) || deletedIds.has(idLower)) return true;
    if (rawId && (deletedIds.has(rawId) || deletedIds.has(rawId.toLowerCase()))) return true;
    if (prefix && (deletedIds.has(`${prefix}_${idStr}`) || deletedIds.has(`${prefix}_${idLower}`))) return true;
    if (rawId && (
      deletedIds.has(`req_${rawId}`) ||
      deletedIds.has(`leave_${rawId}`) ||
      deletedIds.has(`loan_${rawId}`) ||
      deletedIds.has(`swap_${rawId}`) ||
      deletedIds.has(`notif_${rawId}`) ||
      deletedIds.has(`shift_${rawId}`) ||
      deletedIds.has(`punch_${rawId}`) ||
      deletedIds.has(`adj_${rawId}`) ||
      deletedIds.has(`late_inc_${rawId}`) ||
      deletedIds.has(`disc_${rawId}`) ||
      deletedIds.has(`medreq_${rawId}`)
    )) return true;
  }
  if (item._id !== undefined && item._id !== null && item._id !== '') {
    const idStr = String(item._id).trim();
    const idLower = idStr.toLowerCase();
    const rawId = idStr.replace(/^(req_|leave_|swap_|res_|loan_|notif_|shift_|punch_|adj_|late_inc_|medreq_|disc_|perm_|lhist_|obj_inc_|obj_adj_|obj_req_)/, '');
    if (deletedIds.has(idStr) || deletedIds.has(idLower)) return true;
    if (rawId && (deletedIds.has(rawId) || deletedIds.has(rawId.toLowerCase()))) return true;
    if (prefix && (deletedIds.has(`${prefix}_${idStr}`) || deletedIds.has(`${prefix}_${idLower}`))) return true;
    if (rawId && (
      deletedIds.has(`shift_${rawId}`) ||
      deletedIds.has(`punch_${rawId}`) ||
      deletedIds.has(`adj_${rawId}`) ||
      deletedIds.has(`late_inc_${rawId}`)
    )) return true;
  }

  // 5. فحص المعاملات التابعة لموظف محذوف (شفتات، إجازات، سلف، طلبات)
  if (item.employeeId !== undefined && item.employeeId !== null && item.employeeId !== '') {
    const empIdStr = String(item.employeeId).trim();
    const empIdLower = empIdStr.toLowerCase();
    if (
      deletedIds.has(`emp_${empIdStr}`) ||
      deletedIds.has(`emp_${empIdLower}`) ||
      deletedIds.has(`emp_code_${empIdLower}`) ||
      deletedIds.has(`code_${empIdLower}`)
    ) return true;
  }
  if (item.employeeCode !== undefined && item.employeeCode !== null && item.employeeCode !== '') {
    const empCodeStr = String(item.employeeCode).trim().toLowerCase();
    if (
      deletedIds.has(`emp_${empCodeStr}`) ||
      deletedIds.has(`emp_code_${empCodeStr}`) ||
      deletedIds.has(`code_${empCodeStr}`)
    ) return true;
  }

  // 6. فحص الأجهزة المحذوفة
  if (item.deviceId && (
    deletedIds.has(String(item.deviceId)) ||
    deletedIds.has(String(item.deviceId).toLowerCase()) ||
    deletedIds.has(`dev_${item.deviceId}`)
  )) return true;

  // 7. فحص طلبات معينة
  if (item.requestId && (
    deletedIds.has(String(item.requestId)) ||
    deletedIds.has(String(item.requestId).toLowerCase()) ||
    deletedIds.has(`req_${item.requestId}`)
  )) return true;

  return false;
}

// دمج مصفوفتين حسب المفتاح الفريد وحسم التعارضات مع مراعاة العناصر المحذوفة نهائياً ومنع التكرار
export function mergeArrays(localArr = [], remoteArr = [], options = {}) {
  const localList = toSafeArray(localArr);
  const remoteList = toSafeArray(remoteArr);
  
  const rawDeleted = options.deletedIds instanceof Set ? Array.from(options.deletedIds) : toSafeArray(options.deletedIds);
  const deletedIds = new Set();
  for (const d of rawDeleted) {
    if (d === null || d === undefined) continue;
    const s = String(d).trim();
    if (!s) continue;
    deletedIds.add(s);
    deletedIds.add(s.toLowerCase());
  }

  const map = new Map();
  const isRequestEntity = ['req', 'leave', 'loan', 'swap', 'perm', 'res'].includes(options.prefix || '');
  const seenSigMap = new Map();

  // 1. إضافة كل عناصر السحابة (Remote) ما لم تكن محذوفة
  for (const item of remoteList) {
    if (!item || typeof item !== 'object') continue;
    const key = getItemKey(item, options.prefix || 'rem');
    if (key && !isItemDeleted(item, key, deletedIds, options)) {
      if (isRequestEntity) {
        const empId = String(item.employeeId || item.employeeCode || '');
        const rType = String(item.type || item.requestType || options.prefix || '');
        const rDate = String(item.createdAt || item.date || item.timestamp || '').slice(0, 16);
        if (empId && rDate) {
          const sig = `${empId}_${rType}_${rDate}`;
          if (seenSigMap.has(sig)) continue; // تخطي التكرار المباشر
          seenSigMap.set(sig, key);
        }
      }
      map.set(key, item);
    }
  }

  // 2. دمج عناصر الجهاز المحلي (Local)
  for (const item of localList) {
    if (!item || typeof item !== 'object') continue;
    const key = getItemKey(item, options.prefix || 'loc');
    if (!key || isItemDeleted(item, key, deletedIds, options)) continue;

    if (isRequestEntity) {
      const empId = String(item.employeeId || item.employeeCode || '');
      const rType = String(item.type || item.requestType || options.prefix || '');
      const rDate = String(item.createdAt || item.date || item.timestamp || '').slice(0, 16);
      if (empId && rDate) {
        const sig = `${empId}_${rType}_${rDate}`;
        if (seenSigMap.has(sig)) continue; // تخطي التكرار من المحلي
        seenSigMap.set(sig, key);
      }
    }

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

  // 0. معالجة وحسم الموظفين والصلاحيات الصارمة وحماية البصمات الحيوية ونقل الفروع
  if (options.prefix === 'emp') {
    const localTime = getItemTime(localItem);
    const remoteTime = getItemTime(remoteItem);
    let mergedEmp = {};
    if (localTime >= remoteTime) {
      mergedEmp = { ...remoteItem, ...localItem };
      mergedEmp.branchId = localItem.branchId || (localItem.branchesDetails?.[0]?.branchId) || remoteItem.branchId || '';
      mergedEmp.branchesDetails = (Array.isArray(localItem.branchesDetails) && localItem.branchesDetails.length > 0)
        ? localItem.branchesDetails
        : (remoteItem.branchesDetails || []);
      if (localItem.archivedBranchesDetails) {
        mergedEmp.archivedBranchesDetails = localItem.archivedBranchesDetails;
      }
    } else {
      // عند تفوق وقت السحابة: السحابة هي المرجع المعتمد
      mergedEmp = { ...localItem, ...remoteItem };
      mergedEmp.branchId = remoteItem.branchId || (remoteItem.branchesDetails?.[0]?.branchId) || localItem.branchId || '';
      mergedEmp.branchesDetails = (Array.isArray(remoteItem.branchesDetails) && remoteItem.branchesDetails.length > 0)
        ? remoteItem.branchesDetails
        : (localItem.branchesDetails || []);
      if (remoteItem.archivedBranchesDetails) {
        mergedEmp.archivedBranchesDetails = remoteItem.archivedBranchesDetails;
      }
      if (localItem.permissions !== undefined && remoteItem.permissions === undefined) {
        mergedEmp.permissions = localItem.permissions;
      } else if (remoteItem.permissions !== undefined) {
        mergedEmp.permissions = remoteItem.permissions;
      }
    }

    // مزامنة الفرع الأساسي إذا كان متاحاً في تفاصيل الفروع
    if (!mergedEmp.branchId && Array.isArray(mergedEmp.branchesDetails) && mergedEmp.branchesDetails[0]?.branchId) {
      mergedEmp.branchId = mergedEmp.branchesDetails[0].branchId;
    }

    // صيانة المعرف المستقر
    if (localItem.id && remoteItem.id && String(localItem.id) !== String(remoteItem.id)) {
      const lCreated = localItem.createdAt ? new Date(localItem.createdAt).getTime() : 0;
      const rCreated = remoteItem.createdAt ? new Date(remoteItem.createdAt).getTime() : 0;
      if (lCreated > 0 && rCreated > 0) {
        mergedEmp.id = lCreated <= rCreated ? localItem.id : remoteItem.id;
      } else {
        mergedEmp.id = remoteItem.id || localItem.id;
      }
    }

    // ── حماية وصيانة البصمة الإلكترونية من المسح العرضي أثناء الدمج ──
    const localHasFace = Boolean(localItem.has_face_descriptor && localItem.face_descriptor);
    const remoteHasFace = Boolean(remoteItem.has_face_descriptor && remoteItem.face_descriptor);
    const localFaceReset = Math.max(
      localItem.biometricFaceResetAt ? new Date(localItem.biometricFaceResetAt).getTime() : 0,
      localItem.biometricResetAt ? new Date(localItem.biometricResetAt).getTime() : 0
    );
    const remoteFaceReset = Math.max(
      remoteItem.biometricFaceResetAt ? new Date(remoteItem.biometricFaceResetAt).getTime() : 0,
      remoteItem.biometricResetAt ? new Date(remoteItem.biometricResetAt).getTime() : 0
    );
    const localFaceApproved = localItem.biometricFaceApprovedAt ? new Date(localItem.biometricFaceApprovedAt).getTime() : (localItem.biometricApprovedAt ? new Date(localItem.biometricApprovedAt).getTime() : 0);
    const remoteFaceApproved = remoteItem.biometricFaceApprovedAt ? new Date(remoteItem.biometricFaceApprovedAt).getTime() : (remoteItem.biometricApprovedAt ? new Date(remoteItem.biometricApprovedAt).getTime() : 0);

    if (localHasFace && !remoteHasFace) {
      if (remoteFaceReset <= localFaceApproved) {
        mergedEmp.has_face_descriptor = true;
        mergedEmp.face_descriptor = localItem.face_descriptor;
        if (localItem.preferred_biometric) mergedEmp.preferred_biometric = localItem.preferred_biometric;
      } else {
        mergedEmp.has_face_descriptor = false;
        mergedEmp.face_descriptor = null;
      }
    } else if (remoteHasFace && !localHasFace) {
      if (localFaceReset <= remoteFaceApproved && localFaceReset === 0) {
        mergedEmp.has_face_descriptor = true;
        mergedEmp.face_descriptor = remoteItem.face_descriptor;
        if (remoteItem.preferred_biometric) mergedEmp.preferred_biometric = remoteItem.preferred_biometric;
      } else {
        mergedEmp.has_face_descriptor = false;
        mergedEmp.face_descriptor = null;
      }
    } else if (!localHasFace && !remoteHasFace) {
      mergedEmp.has_face_descriptor = false;
      mergedEmp.face_descriptor = null;
    }

    const localHasHand = Boolean(localItem.has_hand_descriptor && localItem.hand_descriptor);
    const remoteHasHand = Boolean(remoteItem.has_hand_descriptor && remoteItem.hand_descriptor);
    const localHandReset = Math.max(
      localItem.biometricHandResetAt ? new Date(localItem.biometricHandResetAt).getTime() : 0,
      localItem.biometricResetAt ? new Date(localItem.biometricResetAt).getTime() : 0
    );
    const remoteHandReset = Math.max(
      remoteItem.biometricHandResetAt ? new Date(remoteItem.biometricHandResetAt).getTime() : 0,
      remoteItem.biometricResetAt ? new Date(remoteItem.biometricResetAt).getTime() : 0
    );
    const localHandApproved = localItem.biometricHandApprovedAt ? new Date(localItem.biometricHandApprovedAt).getTime() : (localItem.biometricApprovedAt ? new Date(localItem.biometricApprovedAt).getTime() : 0);
    const remoteHandApproved = remoteItem.biometricHandApprovedAt ? new Date(remoteItem.biometricHandApprovedAt).getTime() : (remoteItem.biometricApprovedAt ? new Date(remoteItem.biometricApprovedAt).getTime() : 0);

    if (localHasHand && !remoteHasHand) {
      if (remoteHandReset <= localHandApproved) {
        mergedEmp.has_hand_descriptor = true;
        mergedEmp.hand_descriptor = localItem.hand_descriptor;
      } else {
        mergedEmp.has_hand_descriptor = false;
        mergedEmp.hand_descriptor = null;
      }
    } else if (remoteHasHand && !localHasHand) {
      if (localHandReset <= remoteHandApproved && localHandReset === 0) {
        mergedEmp.has_hand_descriptor = true;
        mergedEmp.hand_descriptor = remoteItem.hand_descriptor;
      } else {
        mergedEmp.has_hand_descriptor = false;
        mergedEmp.hand_descriptor = null;
      }
    } else if (!localHasHand && !remoteHasHand) {
      mergedEmp.has_hand_descriptor = false;
      mergedEmp.hand_descriptor = null;
    }

    if (localItem.biometricFaceResetAt || remoteItem.biometricFaceResetAt) {
      mergedEmp.biometricFaceResetAt = localFaceReset >= remoteFaceReset ? localItem.biometricFaceResetAt : remoteItem.biometricFaceResetAt;
    }
    if (localItem.biometricHandResetAt || remoteItem.biometricHandResetAt) {
      mergedEmp.biometricHandResetAt = localHandReset >= remoteHandReset ? localItem.biometricHandResetAt : remoteItem.biometricHandResetAt;
    }
    if (localItem.biometricResetAt || remoteItem.biometricResetAt) {
      const lR = localItem.biometricResetAt ? new Date(localItem.biometricResetAt).getTime() : 0;
      const rR = remoteItem.biometricResetAt ? new Date(remoteItem.biometricResetAt).getTime() : 0;
      mergedEmp.biometricResetAt = lR >= rR ? localItem.biometricResetAt : remoteItem.biometricResetAt;
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
        // Robust dedup key: prefer unique ID or month for auto deductions
        const pKey = p.id || (p.month ? `auto_${p.month}_${p.amount}` : `${p.date}_${p.amount}_${p.paidAt || ''}`);
        payMap.set(pKey, p);
      }
    });
    mergedPaymentsHistory = Array.from(payMap.values());
    const totalAmt = parseFloat(localItem.amount || remoteItem.amount || localItem.totalAmount || remoteItem.totalAmount) || 0;
    const totalFromHistory = mergedPaymentsHistory.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
    
    if (mergedPaymentsHistory.length > 0) {
      mergedPaidAmount = totalAmt > 0 ? Math.min(totalAmt, totalFromHistory) : totalFromHistory;
    } else {
      const fallbackPaid = Math.max(parseFloat(localItem.paidAmount) || 0, parseFloat(remoteItem.paidAmount) || 0);
      mergedPaidAmount = totalAmt > 0 ? Math.min(totalAmt, fallbackPaid) : fallbackPaid;
    }
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

  // 3.5. معالجة وتوحيد تأكيدات قراءة التعليمات والتوجيهات (Read Confirmations)
  if (Array.isArray(localItem.readConfirmations) || Array.isArray(remoteItem.readConfirmations)) {
    const cMap = new Map();
    const allConfirms = [
      ...toSafeArray(remoteItem.readConfirmations),
      ...toSafeArray(localItem.readConfirmations)
    ];
    for (const c of allConfirms) {
      if (c && (c.employeeId || c.employeeCode)) {
        const cKey = String(c.employeeId || c.employeeCode);
        if (!cMap.has(cKey)) cMap.set(cKey, c);
      }
    }
    mergedBase.readConfirmations = Array.from(cMap.values());
  }

  // 5. حماية حالة الاعتماد والرفض والسداد للطلبات من الارتداد لحالة معلقة (Terminal Decision Immunity)
  const isReqType = ['req', 'leave', 'loan', 'swap', 'perm', 'res'].includes(options.prefix) ||
                    Boolean(localItem.requestType || remoteItem.requestType || localItem.employeeId || remoteItem.employeeId);

  if (isReqType) {
    const normalizeStatus = (s) => String(s || '').trim().toLowerCase();
    const lStatus = normalizeStatus(localItem.status);
    const rStatus = normalizeStatus(remoteItem.status);
    
    // الحالات الباتة / المعتمدة والنهائية التي لا يجوز ارتدادها لمعلق
    const TERMINAL_STATUSES = ['approved', 'rejected', 'paid', 'partial', 'cancelled', 'waived', 'completed'];
    const isLocalTerminal = TERMINAL_STATUSES.includes(lStatus);
    const isRemoteTerminal = TERMINAL_STATUSES.includes(rStatus);

    if (isLocalTerminal && !isRemoteTerminal) {
      // المحلي اتخذ قراراً نهائياً بينما السحابة ما زالت معلقة -> القرار المحلي يكسب دائماً
      mergedBase.status = localItem.status;
      if (localItem.adminApproved !== undefined) mergedBase.adminApproved = localItem.adminApproved;
      if (localItem.rejectionReason) mergedBase.rejectionReason = localItem.rejectionReason;
      if (localItem.rejectedAt) mergedBase.rejectedAt = localItem.rejectedAt;
      if (localItem.rejectedBy) mergedBase.rejectedBy = localItem.rejectedBy;
      if (localItem.approvedAt) mergedBase.approvedAt = localItem.approvedAt;
      if (localItem.approvedBy) mergedBase.approvedBy = localItem.approvedBy;
      if (localItem.decided_at) mergedBase.decided_at = localItem.decided_at;
      if (localItem.decided_by) mergedBase.decided_by = localItem.decided_by;
      if (localItem.decision_reason) mergedBase.decision_reason = localItem.decision_reason;
    } else if (isRemoteTerminal && !isLocalTerminal) {
      // السحابة اتخذت قراراً نهائياً بينما المحلي ما زال معلقاً -> قرار السحابة يكسب دائماً
      mergedBase.status = remoteItem.status;
      if (remoteItem.adminApproved !== undefined) mergedBase.adminApproved = remoteItem.adminApproved;
      if (remoteItem.rejectionReason) mergedBase.rejectionReason = remoteItem.rejectionReason;
      if (remoteItem.rejectedAt) mergedBase.rejectedAt = remoteItem.rejectedAt;
      if (remoteItem.rejectedBy) mergedBase.rejectedBy = remoteItem.rejectedBy;
      if (remoteItem.approvedAt) mergedBase.approvedAt = remoteItem.approvedAt;
      if (remoteItem.approvedBy) mergedBase.approvedBy = remoteItem.approvedBy;
      if (remoteItem.decided_at) mergedBase.decided_at = remoteItem.decided_at;
      if (remoteItem.decided_by) mergedBase.decided_by = remoteItem.decided_by;
      if (remoteItem.decision_reason) mergedBase.decision_reason = remoteItem.decision_reason;
    } else if (isLocalTerminal && isRemoteTerminal) {
      // كلاهما قرارات نهائية (مثلاً أحدهما وافق والآخر رفض أو سدد) -> القرار الأحدث زمنياً يحسم
      const lDecidedTime = Math.max(
        getItemTime(localItem.decided_at),
        getItemTime(localItem.approvedAt),
        getItemTime(localItem.rejectedAt),
        getItemTime(localItem.updatedAt)
      );
      const rDecidedTime = Math.max(
        getItemTime(remoteItem.decided_at),
        getItemTime(remoteItem.approvedAt),
        getItemTime(remoteItem.rejectedAt),
        getItemTime(remoteItem.updatedAt)
      );
      const winner = lDecidedTime >= rDecidedTime ? localItem : remoteItem;
      mergedBase.status = winner.status;
      if (winner.adminApproved !== undefined) mergedBase.adminApproved = winner.adminApproved;
      if (winner.rejectionReason) mergedBase.rejectionReason = winner.rejectionReason;
      if (winner.rejectedAt) mergedBase.rejectedAt = winner.rejectedAt;
      if (winner.rejectedBy) mergedBase.rejectedBy = winner.rejectedBy;
      if (winner.approvedAt) mergedBase.approvedAt = winner.approvedAt;
      if (winner.approvedBy) mergedBase.approvedBy = winner.approvedBy;
      if (winner.decided_at) mergedBase.decided_at = winner.decided_at;
      if (winner.decided_by) mergedBase.decided_by = winner.decided_by;
      if (winner.decision_reason) mergedBase.decision_reason = winner.decision_reason;
    }

    // صيانة السلف والمدفوعات للسلف المعتمدة
    if (options.prefix === 'loan' || mergedBase.type === 'loan' || mergedBase.requestType === 'loan') {
      const isApprovedOrPaid = mergedBase.adminApproved === true ||
                               ['approved', 'paid', 'partial'].includes(normalizeStatus(mergedBase.status)) ||
                               (mergedPaidAmount !== undefined && mergedPaidAmount > 0);

      if (isApprovedOrPaid) {
        mergedBase.adminApproved = true;
        const totalAmt = parseFloat(mergedBase.amount || mergedBase.totalAmount) || 0;
        const paid = mergedPaidAmount !== undefined ? mergedPaidAmount : (parseFloat(mergedBase.paidAmount) || 0);
        if (paid >= totalAmt && totalAmt > 0) {
          mergedBase.status = 'paid';
        } else if (paid > 0) {
          mergedBase.status = 'partial';
        } else if (['approved', 'pending'].includes(normalizeStatus(mergedBase.status))) {
          mergedBase.status = 'approved';
        }
      }
    }
  }

  // 6. مزامنة كلمات المرور وإصدار الجلسة للموظفين والفروع لطرد الأجهزة القديمة
  if (options.prefix === 'emp' || options.prefix === 'branch') {
    mergedBase.sessionVersion = Math.max(Number(localItem.sessionVersion || 0), Number(remoteItem.sessionVersion || 0));
    const lPassTime = getItemTime(localItem.passwordChangedAt);
    const rPassTime = getItemTime(remoteItem.passwordChangedAt);
    if (lPassTime > rPassTime && localItem.password) {
      mergedBase.password = localItem.password;
      mergedBase.passwordChangedAt = localItem.passwordChangedAt;
    } else if (rPassTime > lPassTime && remoteItem.password) {
      mergedBase.password = remoteItem.password;
      mergedBase.passwordChangedAt = remoteItem.passwordChangedAt;
    }
  }

  // 7. حماية صفة الإخفاء من شاشة الإدارة العليا hiddenFromAdmin
  if (localItem.hiddenFromAdmin || remoteItem.hiddenFromAdmin) {
    mergedBase.hiddenFromAdmin = true;
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
  const toActiveMap = (raw) => {
    if (!raw) return {};
    if (Array.isArray(raw)) {
      const map = {};
      raw.forEach((item) => {
        if (item && typeof item === 'object') {
          const k = String(item.employeeId || item.id || '');
          if (k) map[k] = item;
        }
      });
      return map;
    }
    if (typeof raw === 'object') return { ...raw };
    return {};
  };

  const local = toActiveMap(localShifts);
  const remote = toActiveMap(remoteShifts);
  const deletedIds = options.deletedIds instanceof Set ? options.deletedIds : new Set(toSafeArray(options.deletedIds).map(String));
  const endedEmpIds = options.endedEmpIds instanceof Set ? options.endedEmpIds : new Set(toSafeArray(options.endedEmpIds).map(String));

  // تاريخ اليوم بالتقويم المحلي لمنع استعادة ورديات قديمة غير مغلقة من أيام سابقة
  const nowObj = new Date();
  const todayStr = `${nowObj.getFullYear()}-${String(nowObj.getMonth() + 1).padStart(2, '0')}-${String(nowObj.getDate()).padStart(2, '0')}`;

  const isShiftDateValid = (dateStr, startEpoch) => {
    if (!dateStr) return false;
    if (dateStr === todayStr) return true;
    // السماح بالورديات الليلية العابرة لمنتصف الليل في غضون 36 ساعة كحد أقصى
    const epoch = startEpoch || (dateStr ? new Date(`${dateStr}T12:00:00`).getTime() : 0);
    if (epoch && (Date.now() - Number(epoch)) < 36 * 3600 * 1000) return true;
    return false;
  };

  // فحص دقيق للوردية المنتهية فعلياً: وجود وقت انصراف صريح أو حالة مكتملة يعني أنها مغلقة قطعاً
  const isShiftTrulyClosed = (s) => {
    if (!s || typeof s !== 'object') return false;
    if (s.status === 'completed' || s.status === 'cancelled' || s.isCancelled) return true;
    const hasValidTimeOut = Boolean(
      s.timeOut &&
      s.timeOut !== '—' &&
      s.timeOut !== '-' &&
      s.timeOut !== '' &&
      s.timeOut !== 'قيد العمل الآن' &&
      s.timeOut !== 'قيد العمل'
    );
    if (hasValidTimeOut) return true;
    if (s.isLiveActive === false && s.timeOut) return true;
    return false;
  };

  // بناء مجموعة لتواقيع ومعرفات الشفتات المكتملة والمغلقة بكافة المعرفات (ID والكود)
  const closedShiftSignatures = new Set();
  const closedShiftIds = new Set();
  if (Array.isArray(mergedShifts)) {
    for (const s of mergedShifts) {
      if (s && isShiftTrulyClosed(s)) {
        if (s.id) closedShiftIds.add(String(s.id));
        if (s.shiftId) closedShiftIds.add(String(s.shiftId));
        if (s.employeeId && s.date && s.timeIn) {
          closedShiftSignatures.add(`${String(s.employeeId)}_${s.date}_${s.timeIn}`);
        }
        if (s.employeeCode && s.date && s.timeIn) {
          closedShiftSignatures.add(`${String(s.employeeCode)}_${s.date}_${s.timeIn}`);
        }
      }
    }
  }

  const isEmpEndedOrClosed = (empKey, act) => {
    const kStr = String(empKey);
    if (deletedIds.has(kStr) || deletedIds.has(`emp_${kStr}`)) return true;
    if (act) {
      if (act.shiftId && closedShiftIds.has(String(act.shiftId))) return true;
      if (act.date && act.timeIn) {
        if (closedShiftSignatures.has(`${kStr}_${act.date}_${act.timeIn}`)) return true;
        if (act.employeeId && closedShiftSignatures.has(`${String(act.employeeId)}_${act.date}_${act.timeIn}`)) return true;
        if (act.employeeCode && closedShiftSignatures.has(`${String(act.employeeCode)}_${act.date}_${act.timeIn}`)) return true;
      }
      // إذا كانت الوردية حية ونشطة لليوم بدون وقت انصراف ولم تُغلق تحديداً، فهي وردية جديدة مصرح بها
      const isLiveOpen = act.timeIn &&
        (!act.timeOut || act.timeOut === '' || act.timeOut === '—' || act.timeOut === 'قيد العمل الآن' || act.timeOut === 'قيد العمل') &&
        isShiftDateValid(act.date, act.startEpoch);
      if (isLiveOpen) {
        return false;
      }
    }
    if (endedEmpIds.has(kStr)) return true;
    if (act && act.employeeId && endedEmpIds.has(String(act.employeeId))) return true;
    if (act && act.employeeCode && endedEmpIds.has(String(act.employeeCode))) return true;
    return false;
  };

  const merged = {};

  // 1. فحص الشفتات النشطة المحلية أولاً (الأولوية لإجراءات الجهاز المحلي لليوم الحالي فقط)
  for (const empId of Object.keys(local)) {
    const act = local[empId];
    if (isEmpEndedOrClosed(empId, act)) continue;
    if (!act || !act.date) continue;
    if (!isShiftDateValid(act.date, act.startEpoch)) continue;
    merged[String(empId)] = act;
  }

  // 2. دمج الشفتات النشطة من السحابة إذا لم تكن مسجلة كانصراف مكتمل أو محذوفة أو منتهية الصلاحية
  for (const empId of Object.keys(remote)) {
    const act = remote[empId];
    if (isEmpEndedOrClosed(empId, act)) continue;
    if (!act || !act.date) continue;
    if (!isShiftDateValid(act.date, act.startEpoch)) continue;

    const sEmpId = String(empId);
    if (!merged[sEmpId]) {
      const hasClosedShiftAfter = Array.isArray(mergedShifts) && mergedShifts.some(
        s => String(s.employeeId) === sEmpId && s.date === act.date && s.timeIn > act.timeIn && isShiftTrulyClosed(s)
      );
      if (!hasClosedShiftAfter) {
        merged[sEmpId] = act;
      }
    } else {
      const localTime = getItemTime(local[empId]);
      const remoteTime = getItemTime(remote[empId]);
      merged[sEmpId] = localTime >= remoteTime ? local[empId] : remote[empId];
    }
  }

  // 3. الاسترداد الذاتي من الورديات المفتوحة في mergedShifts إن وجدت لليوم الحالي فقط
  if (Array.isArray(mergedShifts)) {
    for (const s of mergedShifts) {
      if (!s || !s.employeeId || !s.date || !s.timeIn) continue;
      const empId = String(s.employeeId);
      const empCode = s.employeeCode ? String(s.employeeCode) : '';
      if (endedEmpIds.has(empId) || (empCode && endedEmpIds.has(empCode))) continue;
      if (deletedIds.has(empId) || deletedIds.has(`emp_${empId}`)) continue;
      if (s.status === 'cancelled' || s.status === 'completed' || s.isCancelled) continue;
      if (isShiftTrulyClosed(s) || s.isLiveActive === false) continue;
      const sCreatedEpoch = s.createdAt ? new Date(s.createdAt).getTime() : Date.now();
      if (!isShiftDateValid(s.date, sCreatedEpoch)) continue; // لا نسترجع شفتات قديمة من أيام سابقة كشفتات نشطة اليوم

      if (!merged[empId] && (!empCode || !merged[empCode])) {
        merged[empId] = {
          shiftId: s.id,
          branchId: s.branchId || '',
          branchName: s.branchName || '',
          date: s.date,
          timeIn: s.timeIn,
          startEpoch: sCreatedEpoch,
          isPaused: Boolean(s.isPaused),
          isOnBreak: Boolean(s.isOnBreak),
          breakStartTime: s.breakStartTime || null,
          pauseStartEpoch: s.pauseStartEpoch || null,
          accumulatedPauseMs: s.accumulatedPauseMs || 0,
          updatedAt: Date.now()
        };
      }
    }
  }

  return merged;
}

// دمج شامل وذكي لكامل كائن الحالة (Full State Smart Merge)
export function smartMergeStates(localState, remoteState) {
  if (!remoteState || typeof remoteState !== 'object') return localState;
  if (!localState || typeof localState !== 'object') return remoteState;

  // تجميع كافة شواهد القبور والمعرفات المحذوفة صراحة من الطرفين
  const deletedIds = new Set();
  const rawDeleted = [
    ...toSafeArray(localState._deletedIds || []),
    ...toSafeArray(remoteState._deletedIds || [])
  ];
  for (const d of rawDeleted) {
    if (d === null || d === undefined) continue;
    const s = String(d).trim();
    if (!s) continue;
    deletedIds.add(s);
    deletedIds.add(s.toLowerCase());
  }

  // ── صرامة شواهد القبور (Tombstone Priority) ──
  // شواهد القبور المحذوفة صراحة لها الأولوية المطلقة على أي بيانات مخزنة محلياً في الكاش القديم
  // لمنع عودة الموظفين والكيانات المحذوفة (Zombie Entities) عند مزامنة أجهزة مختلفة.

  // ── حماية المرشحين المقبولين والمعينين في التوظيف من التومبستون ──
  const allCurrentApps = [
    ...toSafeArray(localState.recruitmentApplications),
    ...toSafeArray(remoteState.recruitmentApplications)
  ];
  for (const app of allCurrentApps) {
    if (!app || typeof app !== 'object') continue;
    if (app.status === 'hired') {
      if (app.hiredEmployeeId) {
        const hId = String(app.hiredEmployeeId).trim();
        deletedIds.delete(hId);
        deletedIds.delete(hId.toLowerCase());
        deletedIds.delete(`emp_${hId}`);
        deletedIds.delete(`emp_${hId.toLowerCase()}`);
        deletedIds.delete(`emp_del_${hId}`);
      }
      if (app.hiredEmployeeCode) {
        const hCode = String(app.hiredEmployeeCode).trim();
        deletedIds.delete(hCode);
        deletedIds.delete(hCode.toLowerCase());
        deletedIds.delete(`emp_${hCode}`);
        deletedIds.delete(`emp_code_${hCode}`);
        deletedIds.delete(`emp_code_${hCode.toLowerCase()}`);
      }
    }
  }

  // ── حماية الموظفين الفعليين على رأس العمل من شواهد القبور القديمة ──
  const allCurrentEmps = [
    ...toSafeArray(localState.employees),
    ...toSafeArray(remoteState.employees)
  ];
  for (const emp of allCurrentEmps) {
    if (!emp || typeof emp !== 'object') continue;
    const isActive = emp.is_active !== false && emp.status !== 'تم الاستقالة' && emp.status !== 'resigned';
    if (isActive) {
      if (emp.id) {
        const eId = String(emp.id).trim();
        deletedIds.delete(eId);
        deletedIds.delete(eId.toLowerCase());
        deletedIds.delete(`emp_${eId}`);
        deletedIds.delete(`emp_${eId.toLowerCase()}`);
        deletedIds.delete(`emp_del_${eId}`);
      }
      if (emp.code) {
        const eCode = String(emp.code).trim().toLowerCase();
        deletedIds.delete(eCode);
        deletedIds.delete(`emp_${eCode}`);
        deletedIds.delete(`emp_code_${eCode}`);
        deletedIds.delete(`code_${eCode}`);
      }
      if (emp.username) {
        const u = String(emp.username).trim().toLowerCase();
        deletedIds.delete(u);
        deletedIds.delete(`emp_${u}`);
        deletedIds.delete(`emp_user_${u}`);
        deletedIds.delete(`user_${u}`);
      }
      if (emp.nationalId) {
        const nid = String(emp.nationalId).replace(/\D/g, '');
        if (nid) {
          deletedIds.delete(`emp_nid_${nid}`);
          deletedIds.delete(`nid_${nid}`);
        }
      }
    }
  }

  // معالجة ومراعاة تاريخ التصفير الشامل _wipedAt إن وجد لمنع إعادة إحياء البيانات القديمة
  const remoteWipeTime = remoteState._wipedAt ? new Date(remoteState._wipedAt).getTime() : 0;
  const localWipeTime = localState._wipedAt ? new Date(localState._wipedAt).getTime() : 0;
  const isRemoteWipeNewer = remoteWipeTime > localWipeTime;
  const isLocalWipeNewer = localWipeTime > remoteWipeTime;

  const filterPreWipe = (arr, wipeTime, isEmployeeArray = false) => {
    if (!wipeTime || wipeTime <= 0) return arr;
    return toSafeArray(arr).filter((item) => {
      if (isEmployeeArray && item && item.name && item.status !== 'تم الاستقالة' && item.is_active !== false) {
        return true; // الموظفون النشطون محصنون تماماً من التصفير العرضي
      }
      const itemT = getItemTime(item);
      return itemT >= wipeTime;
    });
  };

  const effectiveLocal = { ...localState };
  const effectiveRemote = { ...remoteState };

  if (isRemoteWipeNewer) {
    // السحابة قامت بعمل تصفير، نمنع الجهاز المحلي من إعادة إرسال الكيانات القديمة التي أنشئت قبل التصفير
    effectiveLocal.employees = filterPreWipe(effectiveLocal.employees, remoteWipeTime, true);
    effectiveLocal.shifts = filterPreWipe(effectiveLocal.shifts, remoteWipeTime);
    effectiveLocal.requests = filterPreWipe(effectiveLocal.requests, remoteWipeTime);
    effectiveLocal.leaveRequests = filterPreWipe(effectiveLocal.leaveRequests, remoteWipeTime);
    effectiveLocal.loans = filterPreWipe(effectiveLocal.loans, remoteWipeTime);
    effectiveLocal.adjustments = filterPreWipe(effectiveLocal.adjustments, remoteWipeTime);
    effectiveLocal.rosters = filterPreWipe(effectiveLocal.rosters, remoteWipeTime);
    effectiveLocal.lateIncidents = filterPreWipe(effectiveLocal.lateIncidents, remoteWipeTime);
    effectiveLocal.employeeNotes = filterPreWipe(effectiveLocal.employeeNotes, remoteWipeTime);
    effectiveLocal.evaluations = filterPreWipe(effectiveLocal.evaluations, remoteWipeTime);
    effectiveLocal.activeShifts = {};
  } else if (isLocalWipeNewer) {
    // الجهاز المحلي قام بعمل تصفير حديث، نمنع السحابة من إعادة البيانات الممسوحة
    effectiveRemote.employees = filterPreWipe(effectiveRemote.employees, localWipeTime, true);
    effectiveRemote.shifts = filterPreWipe(effectiveRemote.shifts, localWipeTime);
    effectiveRemote.requests = filterPreWipe(effectiveRemote.requests, localWipeTime);
    effectiveRemote.leaveRequests = filterPreWipe(effectiveRemote.leaveRequests, localWipeTime);
    effectiveRemote.loans = filterPreWipe(effectiveRemote.loans, localWipeTime);
    effectiveRemote.adjustments = filterPreWipe(effectiveRemote.adjustments, localWipeTime);
    effectiveRemote.rosters = filterPreWipe(effectiveRemote.rosters, localWipeTime);
    effectiveRemote.lateIncidents = filterPreWipe(effectiveRemote.lateIncidents, localWipeTime);
    effectiveRemote.employeeNotes = filterPreWipe(effectiveRemote.employeeNotes, localWipeTime);
    effectiveRemote.evaluations = filterPreWipe(effectiveRemote.evaluations, localWipeTime);
    effectiveRemote.activeShifts = {};
  }

  // معالجة ومراعاة تاريخ تطهير ومسح الطلبات _requestsClearedAt لمنع إعادة إحياء أي طلبات قديمة
  const remoteReqClearTime = remoteState._requestsClearedAt ? new Date(remoteState._requestsClearedAt).getTime() : 0;
  const localReqClearTime = localState._requestsClearedAt ? new Date(localState._requestsClearedAt).getTime() : 0;
  const effectiveReqClearTime = Math.max(remoteReqClearTime, localReqClearTime);

  if (effectiveReqClearTime > 0) {
    effectiveLocal.requests = filterPreWipe(effectiveLocal.requests, effectiveReqClearTime);
    effectiveLocal.leaveRequests = filterPreWipe(effectiveLocal.leaveRequests, effectiveReqClearTime);
    effectiveLocal.shiftSwaps = filterPreWipe(effectiveLocal.shiftSwaps, effectiveReqClearTime);
    effectiveLocal.resignationRequests = filterPreWipe(effectiveLocal.resignationRequests, effectiveReqClearTime);
    if (Array.isArray(effectiveLocal.permissionRequests)) {
      effectiveLocal.permissionRequests = filterPreWipe(effectiveLocal.permissionRequests, effectiveReqClearTime);
    }

    effectiveRemote.requests = filterPreWipe(effectiveRemote.requests, effectiveReqClearTime);
    effectiveRemote.leaveRequests = filterPreWipe(effectiveRemote.leaveRequests, effectiveReqClearTime);
    effectiveRemote.shiftSwaps = filterPreWipe(effectiveRemote.shiftSwaps, effectiveReqClearTime);
    effectiveRemote.resignationRequests = filterPreWipe(effectiveRemote.resignationRequests, effectiveReqClearTime);
    if (Array.isArray(effectiveRemote.permissionRequests)) {
      effectiveRemote.permissionRequests = filterPreWipe(effectiveRemote.permissionRequests, effectiveReqClearTime);
    }
  }

  const mergedShifts = mergeArrays(effectiveLocal.shifts, effectiveRemote.shifts, { prefix: 'shift', deletedIds });

  return {
    ...effectiveRemote,
    ...effectiveLocal,

    // 1. الإعدادات واللائحة
    orgSettings: (() => {
      const localSettings = localState.orgSettings || {};
      const remoteSettings = remoteState.orgSettings || {};
      const localTime = getItemTime(localSettings);
      const remoteTime = getItemTime(remoteSettings);
      
      let mergedSettings = {};
      if (localTime >= remoteTime) {
        mergedSettings = { ...remoteSettings, ...localSettings };
        if (localSettings.permissions !== undefined) {
          mergedSettings.permissions = localSettings.permissions;
        } else if (remoteSettings.permissions !== undefined) {
          mergedSettings.permissions = remoteSettings.permissions;
        }
        
        if (localSettings.empPermissions !== undefined) {
          mergedSettings.empPermissions = {
            ...(remoteSettings.empPermissions || {}),
            ...(localSettings.empPermissions || {})
          };
        } else if (remoteSettings.empPermissions !== undefined) {
          mergedSettings.empPermissions = remoteSettings.empPermissions;
        }
      } else {
        mergedSettings = { ...localSettings, ...remoteSettings };
        if (remoteSettings.permissions !== undefined) {
          mergedSettings.permissions = remoteSettings.permissions;
        } else if (localSettings.permissions !== undefined) {
          mergedSettings.permissions = localSettings.permissions;
        }
        
        if (remoteSettings.empPermissions !== undefined) {
          mergedSettings.empPermissions = {
            ...(localSettings.empPermissions || {}),
            ...(remoteSettings.empPermissions || {})
          };
        } else if (localSettings.empPermissions !== undefined) {
          mergedSettings.empPermissions = localSettings.empPermissions;
        }
      }

      // دمج عميق لأقفال المالك لضمان عدم فقدان أي قفل عند التزامن مع احترام الإعدادات الأحدث
      if (localTime >= remoteTime) {
        mergedSettings.ownerModificationLocks = {
          ...(remoteSettings.ownerModificationLocks || {}),
          ...(localSettings.ownerModificationLocks || {})
        };
      } else {
        mergedSettings.ownerModificationLocks = {
          ...(localSettings.ownerModificationLocks || {}),
          ...(remoteSettings.ownerModificationLocks || {})
        };
      }

      // ── مزامنة ذكية لبيانات دخول المالك والأدمن عبر الطوابع الزمنية المستقلة ──
      // 1. كلمة مرور المالك (Owner Password)
      const localOwnerPassTime = getItemTime(localSettings.ownerPasswordUpdatedAt);
      const remoteOwnerPassTime = getItemTime(remoteSettings.ownerPasswordUpdatedAt);

      if (localOwnerPassTime > remoteOwnerPassTime) {
        mergedSettings.ownerPassword = localSettings.ownerPassword;
        mergedSettings.ownerPasswordUpdatedAt = localSettings.ownerPasswordUpdatedAt;
      } else if (remoteOwnerPassTime > localOwnerPassTime) {
        mergedSettings.ownerPassword = remoteSettings.ownerPassword;
        mergedSettings.ownerPasswordUpdatedAt = remoteSettings.ownerPasswordUpdatedAt;
      } else {
        const defaultOwnerPasses = ['owner123'];
        const isLocalCustom = localSettings.ownerPassword && !defaultOwnerPasses.includes(localSettings.ownerPassword);
        const isRemoteCustom = remoteSettings.ownerPassword && !defaultOwnerPasses.includes(remoteSettings.ownerPassword);

        if (isRemoteCustom && !isLocalCustom) {
          mergedSettings.ownerPassword = remoteSettings.ownerPassword;
        } else if (isLocalCustom && !isRemoteCustom) {
          mergedSettings.ownerPassword = localSettings.ownerPassword;
        } else if (remoteTime >= localTime) {
          mergedSettings.ownerPassword = remoteSettings.ownerPassword || localSettings.ownerPassword || 'owner123';
        } else {
          mergedSettings.ownerPassword = localSettings.ownerPassword || remoteSettings.ownerPassword || 'owner123';
        }
      }

      // 2. اسم مستخدم المالك (Owner Username)
      const localOwnerUserTime = getItemTime(localSettings.ownerUsernameUpdatedAt);
      const remoteOwnerUserTime = getItemTime(remoteSettings.ownerUsernameUpdatedAt);
      if (localOwnerUserTime > remoteOwnerUserTime) {
        mergedSettings.ownerUsername = localSettings.ownerUsername;
        mergedSettings.ownerUsernameUpdatedAt = localSettings.ownerUsernameUpdatedAt;
      } else if (remoteOwnerUserTime > localOwnerUserTime) {
        mergedSettings.ownerUsername = remoteSettings.ownerUsername;
        mergedSettings.ownerUsernameUpdatedAt = remoteSettings.ownerUsernameUpdatedAt;
      } else {
        mergedSettings.ownerUsername = (remoteTime >= localTime ? remoteSettings.ownerUsername : localSettings.ownerUsername) || 'owner';
      }

      // 3. كلمة مرور الأدمن والإدارة (Admin Password)
      const localAdminPassTime = getItemTime(localSettings.adminPasswordUpdatedAt);
      const remoteAdminPassTime = getItemTime(remoteSettings.adminPasswordUpdatedAt);

      let chosenAdminPass = '';
      let chosenAdminPassTime = null;
      if (localAdminPassTime > remoteAdminPassTime) {
        chosenAdminPass = localSettings.adminPassword || localSettings.adminPass;
        chosenAdminPassTime = localSettings.adminPasswordUpdatedAt;
      } else if (remoteAdminPassTime > localAdminPassTime) {
        chosenAdminPass = remoteSettings.adminPassword || remoteSettings.adminPass;
        chosenAdminPassTime = remoteSettings.adminPasswordUpdatedAt;
      } else {
        const defaultAdminPasses = ['123', 'admin123'];
        const localAdminCandidate = localSettings.adminPassword || localSettings.adminPass;
        const remoteAdminCandidate = remoteSettings.adminPassword || remoteSettings.adminPass;
        const isLocalAdminCustom = localAdminCandidate && !defaultAdminPasses.includes(localAdminCandidate);
        const isRemoteAdminCustom = remoteAdminCandidate && !defaultAdminPasses.includes(remoteAdminCandidate);

        if (isRemoteAdminCustom && !isLocalAdminCustom) {
          chosenAdminPass = remoteAdminCandidate;
        } else if (isLocalAdminCustom && !isRemoteAdminCustom) {
          chosenAdminPass = localAdminCandidate;
        } else if (remoteTime >= localTime) {
          chosenAdminPass = remoteAdminCandidate || localAdminCandidate;
        } else {
          chosenAdminPass = localAdminCandidate || remoteAdminCandidate;
        }
      }
      if (chosenAdminPass) {
        mergedSettings.adminPassword = chosenAdminPass;
        mergedSettings.adminPass = chosenAdminPass;
        if (chosenAdminPassTime) mergedSettings.adminPasswordUpdatedAt = chosenAdminPassTime;
      }

      // 4. اسم مستخدم الأدمن (Admin Username)
      mergedSettings.adminUsername = (remoteTime >= localTime ? (remoteSettings.adminUsername || remoteSettings.adminUser) : (localSettings.adminUsername || localSettings.adminUser)) || 'admin';
      mergedSettings.adminUser = mergedSettings.adminUsername;

      // 5. إصدارات الجلسات (Session Versions) لطرد الأجهزة القديمة
      mergedSettings.ownerSessionVersion = Math.max(Number(localSettings.ownerSessionVersion || 0), Number(remoteSettings.ownerSessionVersion || 0));
      mergedSettings.adminSessionVersion = Math.max(Number(localSettings.adminSessionVersion || 0), Number(remoteSettings.adminSessionVersion || 0));

      // دمج عميق ومحمي لإعدادات بريد Gmail لضمان عدم فقدان بيانات الربط
      const localGmail = localSettings.gmailConfig || {};
      const remoteGmail = remoteSettings.gmailConfig || {};
      const localGmailTime = getItemTime(localGmail) || localTime;
      const remoteGmailTime = getItemTime(remoteGmail) || remoteTime;
      let mergedGmail = {};
      if (localGmailTime >= remoteGmailTime) {
        mergedGmail = { ...remoteGmail, ...localGmail };
      } else {
        mergedGmail = { ...localGmail, ...remoteGmail };
      }
      if (!mergedGmail.userEmail) mergedGmail.userEmail = localGmail.userEmail || remoteGmail.userEmail || '';
      if (!mergedGmail.appPassword) mergedGmail.appPassword = localGmail.appPassword || remoteGmail.appPassword || '';
      if (!mergedGmail.targetAdminEmail) mergedGmail.targetAdminEmail = localGmail.targetAdminEmail || remoteGmail.targetAdminEmail || '';
      if (!mergedGmail.serviceUrl) mergedGmail.serviceUrl = localGmail.serviceUrl || remoteGmail.serviceUrl || '';
      if (!mergedGmail.dailyDigestTime) mergedGmail.dailyDigestTime = localGmail.dailyDigestTime || remoteGmail.dailyDigestTime || '';
      if (!mergedGmail.systemUrl) mergedGmail.systemUrl = localGmail.systemUrl || remoteGmail.systemUrl || '';
      if (!mergedGmail.targetAdminEmails || mergedGmail.targetAdminEmails.length === 0) {
        mergedGmail.targetAdminEmails = (localGmail.targetAdminEmails?.length ? localGmail.targetAdminEmails : remoteGmail.targetAdminEmails) || [];
      }
      if (mergedGmail.branchNoShowGraceMinutes === undefined) {
        const val = (localGmail.branchNoShowGraceMinutes !== undefined && localGmail.branchNoShowGraceMinutes !== '')
          ? localGmail.branchNoShowGraceMinutes
          : remoteGmail.branchNoShowGraceMinutes;
        mergedGmail.branchNoShowGraceMinutes = (val !== undefined && val !== null) ? val : '';
      }
      if (mergedGmail.earlyDepartureBeforeClosingGraceMinutes === undefined) {
        const val = (localGmail.earlyDepartureBeforeClosingGraceMinutes !== undefined && localGmail.earlyDepartureBeforeClosingGraceMinutes !== '')
          ? localGmail.earlyDepartureBeforeClosingGraceMinutes
          : remoteGmail.earlyDepartureBeforeClosingGraceMinutes;
        mergedGmail.earlyDepartureBeforeClosingGraceMinutes = (val !== undefined && val !== null) ? val : '';
      }
      if (mergedGmail.sendOnEarlyDepartureBeforeClosing === undefined) {
        mergedGmail.sendOnEarlyDepartureBeforeClosing = localGmail.sendOnEarlyDepartureBeforeClosing !== undefined ? localGmail.sendOnEarlyDepartureBeforeClosing : (remoteGmail.sendOnEarlyDepartureBeforeClosing ?? true);
      }
      // فحص إضافي من localStorage لضمان عدم ضياع التوقيت أو المهل إذا تم ضبطها محلياً
      try {
        const lsSaved = JSON.parse(localStorage.getItem('pharmacy_gmail_config') || '{}');
        if (!mergedGmail.dailyDigestTime && lsSaved?.dailyDigestTime) {
          mergedGmail.dailyDigestTime = lsSaved.dailyDigestTime;
        }
        if (!mergedGmail.userEmail && lsSaved?.userEmail) {
          mergedGmail.userEmail = lsSaved.userEmail;
        }
        if (lsSaved?.branchNoShowGraceMinutes !== undefined && lsSaved?.branchNoShowGraceMinutes !== '') {
          mergedGmail.branchNoShowGraceMinutes = lsSaved.branchNoShowGraceMinutes;
        }
        if (lsSaved?.earlyDepartureBeforeClosingGraceMinutes !== undefined && lsSaved?.earlyDepartureBeforeClosingGraceMinutes !== '') {
          mergedGmail.earlyDepartureBeforeClosingGraceMinutes = lsSaved.earlyDepartureBeforeClosingGraceMinutes;
        }
      } catch {}
      mergedSettings.gmailConfig = mergedGmail;

      // دمج عميق لإعدادات Google Drive
      const localDrive = localSettings.driveConfig || {};
      const remoteDrive = remoteSettings.driveConfig || {};
      const localDriveTime = getItemTime(localDrive) || localTime;
      const remoteDriveTime = getItemTime(remoteDrive) || remoteTime;
      let mergedDrive = {};
      if (localDriveTime >= remoteDriveTime) {
        mergedDrive = { ...remoteDrive, ...localDrive };
      } else {
        mergedDrive = { ...localDrive, ...remoteDrive };
      }
      if (!mergedDrive.serviceUrl) mergedDrive.serviceUrl = localDrive.serviceUrl || remoteDrive.serviceUrl || '';
      if (!mergedDrive.parentFolderId) mergedDrive.parentFolderId = localDrive.parentFolderId || remoteDrive.parentFolderId || '';
      mergedSettings.driveConfig = mergedDrive;

      // الحفاظ على قائمة راوترات الفروع المعتمدة وتسمياتها
      const localRouters = Array.isArray(localSettings.approvedRouters) ? localSettings.approvedRouters : [];
      const remoteRouters = Array.isArray(remoteSettings.approvedRouters) ? remoteSettings.approvedRouters : [];
      if (localTime >= remoteTime) {
        mergedSettings.approvedRouters = localRouters.length > 0 ? localRouters : (remoteRouters.length > 0 ? remoteRouters : mergedSettings.approvedRouters);
      } else {
        mergedSettings.approvedRouters = remoteRouters.length > 0 ? remoteRouters : (localRouters.length > 0 ? localRouters : mergedSettings.approvedRouters);
      }

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
    ipRestrictions: (() => {
      const localIp = effectiveLocal.ipRestrictions || localState.ipRestrictions || {};
      const remoteIp = effectiveRemote.ipRestrictions || remoteState.ipRestrictions || {};
      const localTime = new Date(localIp._updatedAt || effectiveLocal._ipRestrictionsUpdatedAt || 0).getTime();
      const remoteTime = new Date(remoteIp._updatedAt || effectiveRemote._ipRestrictionsUpdatedAt || 0).getTime();

      let base = {};
      if (localTime >= remoteTime) {
        base = { ...remoteIp, ...localIp };
      } else {
        base = { ...localIp, ...remoteIp };
      }

      const localList = Array.isArray(localIp.allowedIps) ? localIp.allowedIps : [];
      const remoteList = Array.isArray(remoteIp.allowedIps) ? remoteIp.allowedIps : [];

      let allowedIps = [];
      if (localTime > remoteTime) {
        allowedIps = localList;
      } else if (remoteTime > localTime) {
        allowedIps = remoteList;
      } else {
        if (localList.length > 0 && remoteList.length === 0) {
          allowedIps = localList;
        } else if (remoteList.length > 0 && localList.length === 0) {
          allowedIps = remoteList;
        } else if (localList.length > 0) {
          const map = new Map();
          remoteList.forEach(item => {
            const ip = typeof item === 'string' ? item : item?.ip;
            if (ip) map.set(ip, typeof item === 'string' ? { ip, label: 'راوتر معتمد' } : item);
          });
          localList.forEach(item => {
            const ip = typeof item === 'string' ? item : item?.ip;
            if (ip) map.set(ip, typeof item === 'string' ? { ip, label: 'راوتر معتمد' } : item);
          });
          allowedIps = Array.from(map.values());
        }
      }

      if (allowedIps.length === 0) {
        const orgRouters = effectiveLocal.orgSettings?.approvedRouters || effectiveRemote.orgSettings?.approvedRouters;
        if (Array.isArray(orgRouters) && orgRouters.length > 0) {
          allowedIps = orgRouters;
        } else {
          const orgIps = effectiveLocal.orgSettings?.approvedIPs || effectiveRemote.orgSettings?.approvedIPs;
          if (Array.isArray(orgIps) && orgIps.length > 0) {
            allowedIps = orgIps.map((ip, idx) =>
              typeof ip === 'string' ? { ip, label: `راوتر ${idx + 1}` } : ip
            );
          }
        }
      }

      const normalizedList = allowedIps
        .filter(item => Boolean(item && (typeof item === 'string' ? item.trim() : item.ip?.trim())))
        .map((item, idx) => {
          const ip = typeof item === 'string' ? item.trim() : (item.ip || '').trim();
          const label = (typeof item === 'string' ? `راوتر ${idx + 1}` : (item.label || `راوتر ${idx + 1}`)).trim();
          return { ip, label };
        });

      return {
        ...base,
        enabled: (localTime >= remoteTime ? localIp.enabled : remoteIp.enabled) ?? (localIp.enabled || remoteIp.enabled || false),
        allowedIps: normalizedList,
        ...(base._updatedAt ? { _updatedAt: base._updatedAt } : {})
      };
    })(),

    // 2. الكيانات والمصفوفات الأساسية
    branches: mergeArrays(effectiveLocal.branches, effectiveRemote.branches, { prefix: 'branch', deletedIds }),
    employees: mergeArrays(effectiveLocal.employees, effectiveRemote.employees, { prefix: 'emp', deletedIds }),
    shifts: mergedShifts,
    approvalRules: (() => {
      if (effectiveLocal._approvalRulesUpdatedAt || effectiveRemote._approvalRulesUpdatedAt) {
        const localT = new Date(effectiveLocal._approvalRulesUpdatedAt || 0).getTime();
        const remoteT = new Date(effectiveRemote._approvalRulesUpdatedAt || 0).getTime();
        return localT >= remoteT ? (effectiveLocal.approvalRules || []) : (effectiveRemote.approvalRules || []);
      }
      return effectiveLocal.approvalRules && effectiveLocal.approvalRules.length > 0 
        ? effectiveLocal.approvalRules 
        : (effectiveRemote.approvalRules || []);
    })(),
    authorizedDevices: mergeArrays(effectiveLocal.authorizedDevices, effectiveRemote.authorizedDevices, { prefix: 'dev', deletedIds }),

    requests: mergeArrays(effectiveLocal.requests, effectiveRemote.requests, { prefix: 'req', deletedIds }),
    resignationRequests: mergeArrays(effectiveLocal.resignationRequests, effectiveRemote.resignationRequests, { prefix: 'res', deletedIds }),
    leaveRequests: mergeArrays(effectiveLocal.leaveRequests, effectiveRemote.leaveRequests, { prefix: 'leave', deletedIds }),
    permissionRequests: mergeArrays(effectiveLocal.permissionRequests, effectiveRemote.permissionRequests, { prefix: 'perm', deletedIds }),
    leaveHistory: mergeArrays(effectiveLocal.leaveHistory, effectiveRemote.leaveHistory, { prefix: 'lhist', deletedIds }),
    shiftSwaps: mergeArrays(effectiveLocal.shiftSwaps, effectiveRemote.shiftSwaps, { prefix: 'swap', deletedIds }),
    loans: mergeArrays(effectiveLocal.loans, effectiveRemote.loans, { prefix: 'loan', deletedIds }),
    logs: mergeArrays(effectiveLocal.logs, effectiveRemote.logs, { prefix: 'log', deletedIds }),
    evaluations: mergeArrays(effectiveLocal.evaluations, effectiveRemote.evaluations, { prefix: 'eval', deletedIds }),
    notifications: (() => {
      let list = mergeArrays(effectiveLocal.notifications, effectiveRemote.notifications, { prefix: 'notif', deletedIds });
      const clearedAt = effectiveLocal._notificationsClearedAt || effectiveRemote._notificationsClearedAt;
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
    adjustments: mergeArrays(effectiveLocal.adjustments, effectiveRemote.adjustments, { prefix: 'adj', deletedIds }),
    lateIncidents: mergeArrays(effectiveLocal.lateIncidents, effectiveRemote.lateIncidents, { prefix: 'late_inc', deletedIds }),
    employeeNotes: mergeArrays(effectiveLocal.employeeNotes, effectiveRemote.employeeNotes, { prefix: 'note', deletedIds }),
    finances: mergeArrays(effectiveLocal.finances, effectiveRemote.finances, { prefix: 'fin', deletedIds }),
    transactions: mergeArrays(effectiveLocal.transactions, effectiveRemote.transactions, { prefix: 'tx', deletedIds }),

    recruitmentApplications: mergeArrays(effectiveLocal.recruitmentApplications, effectiveRemote.recruitmentApplications, { prefix: 'app', deletedIds }),
    jobVacancies: mergeArrays(effectiveLocal.jobVacancies, effectiveRemote.jobVacancies, { prefix: 'vac', deletedIds }),
    branchSales: mergeArrays(effectiveLocal.branchSales, effectiveRemote.branchSales, { prefix: 'sale', deletedIds }),
    branchSalesTargets: (() => {
      const merged = { ...(effectiveRemote.branchSalesTargets || {}) };
      const localTargets = effectiveLocal.branchSalesTargets || {};
      Object.keys(localTargets).forEach((mKey) => {
        merged[mKey] = {
          ...(merged[mKey] || {}),
          ...(localTargets[mKey] || {})
        };
      });
      return merged;
    })(),
    branchSalesSettings: {
      allowBranchManagersEntry: false,
      topN: 3,
      ...(effectiveRemote.branchSalesSettings || {}),
      ...(effectiveLocal.branchSalesSettings || {})
    },
    rosters: mergeRosters(effectiveLocal.rosters, effectiveRemote.rosters, { deletedIds }),
    ...(() => {
      const mergedActive = mergeActiveShifts(effectiveLocal.activeShifts, effectiveRemote.activeShifts, mergedShifts, {
        deletedIds,
        endedEmpIds: new Set([
          ...(effectiveLocal._endedShiftEmpIds || []),
          ...(effectiveRemote._endedShiftEmpIds || [])
        ].map(String))
      });
      const activeKeys = new Set();
      Object.entries(mergedActive || {}).forEach(([k, s]) => {
        activeKeys.add(String(k));
        if (s?.employeeId) activeKeys.add(String(s.employeeId));
        if (s?.employeeCode) activeKeys.add(String(s.employeeCode));
      });
      const cleanedEnded = Array.from(new Set([
        ...(effectiveLocal._endedShiftEmpIds || []),
        ...(effectiveRemote._endedShiftEmpIds || [])
      ].map(String))).filter(id => !activeKeys.has(id)).slice(-1000);

      return {
        activeShifts: mergedActive,
        _endedShiftEmpIds: cleanedEnded
      };
    })(),
    branchDirectives: mergeArrays(effectiveLocal.branchDirectives, effectiveRemote.branchDirectives, { prefix: 'bdir', deletedIds }),
    adminDirectives: mergeArrays(effectiveLocal.adminDirectives, effectiveRemote.adminDirectives, { prefix: 'adir', deletedIds }),
    _notificationsClearedAt: effectiveLocal._notificationsClearedAt || effectiveRemote._notificationsClearedAt || null,
    _requestsClearedAt: effectiveReqClearTime > 0 ? (remoteReqClearTime >= localReqClearTime ? effectiveRemote._requestsClearedAt : effectiveLocal._requestsClearedAt) : (effectiveRemote._requestsClearedAt || effectiveLocal._requestsClearedAt || null),
    _wipedAt: isRemoteWipeNewer ? effectiveRemote._wipedAt : (isLocalWipeNewer ? effectiveLocal._wipedAt : (effectiveRemote._wipedAt || effectiveLocal._wipedAt || null)),
    _deletedIds: Array.from(deletedIds).slice(-10000)
  };
}
