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
      if (idStr.startsWith('emp_') && (deletedIds.has(idStr) || deletedIds.has(idLower))) return true;
      if (deletedIds.has(`emp_${idStr}`) || deletedIds.has(`emp_${idLower}`) || deletedIds.has(`emp_del_${idStr}`)) return true;
    }
    if (item._id) {
      const _idStr = String(item._id).trim();
      if (_idStr.startsWith('emp_') && (deletedIds.has(_idStr) || deletedIds.has(_idStr.toLowerCase()))) return true;
      if (deletedIds.has(`emp_${_idStr}`)) return true;
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
    if (deletedIds.has(idStr) || deletedIds.has(idLower)) return true;
    if (prefix && (deletedIds.has(`${prefix}_${idStr}`) || deletedIds.has(`${prefix}_${idLower}`))) return true;
  }
  if (item._id !== undefined && item._id !== null && item._id !== '') {
    const idStr = String(item._id).trim();
    const idLower = idStr.toLowerCase();
    if (deletedIds.has(idStr) || deletedIds.has(idLower)) return true;
    if (prefix && (deletedIds.has(`${prefix}_${idStr}`) || deletedIds.has(`${prefix}_${idLower}`))) return true;
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

// دمج مصفوفتين حسب المفتاح الفريد وحسم التعارضات مع مراعاة العناصر المحذوفة نهائياً
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

  // 1. إضافة كل عناصر السحابة (Remote) ما لم تكن محذوفة
  for (const item of remoteList) {
    if (!item || typeof item !== 'object') continue;
    const key = getItemKey(item, options.prefix || 'rem');
    if (key && !isItemDeleted(item, key, deletedIds, options)) {
      map.set(key, item);
    }
  }

  // 2. دمج عناصر الجهاز المحلي (Local)
  for (const item of localList) {
    if (!item || typeof item !== 'object') continue;
    const key = getItemKey(item, options.prefix || 'loc');
    if (!key || isItemDeleted(item, key, deletedIds, options)) continue;

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

  // 0. معالجة وحسم الموظفين والصلاحيات الصارمة وحماية البصمات الحيوية
  if (options.prefix === 'emp') {
    const localTime = getItemTime(localItem);
    const remoteTime = getItemTime(remoteItem);
    let mergedEmp = {};
    if (localTime >= remoteTime) {
      mergedEmp = { ...remoteItem, ...localItem };
    } else {
      // عند تفوق وقت السحابة: السحابة هي المرجع المعتمد
      mergedEmp = { ...localItem, ...remoteItem };
      if (localItem.permissions !== undefined && remoteItem.permissions === undefined) {
        mergedEmp.permissions = localItem.permissions;
      } else if (remoteItem.permissions !== undefined) {
        mergedEmp.permissions = remoteItem.permissions;
      }
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
    const localFaceReset = localItem.biometricResetAt ? new Date(localItem.biometricResetAt).getTime() : 0;
    const remoteFaceReset = remoteItem.biometricResetAt ? new Date(remoteItem.biometricResetAt).getTime() : 0;
    const localFaceApproved = localItem.biometricApprovedAt ? new Date(localItem.biometricApprovedAt).getTime() : 0;
    const remoteFaceApproved = remoteItem.biometricApprovedAt ? new Date(remoteItem.biometricApprovedAt).getTime() : 0;

    if (localHasFace && !remoteHasFace) {
      if (remoteFaceReset <= localFaceApproved) {
        mergedEmp.has_face_descriptor = true;
        mergedEmp.face_descriptor = localItem.face_descriptor;
        if (localItem.preferred_biometric) mergedEmp.preferred_biometric = localItem.preferred_biometric;
      }
    } else if (remoteHasFace && !localHasFace) {
      if (localFaceReset <= remoteFaceApproved) {
        mergedEmp.has_face_descriptor = true;
        mergedEmp.face_descriptor = remoteItem.face_descriptor;
        if (remoteItem.preferred_biometric) mergedEmp.preferred_biometric = remoteItem.preferred_biometric;
      }
    }

    const localHasHand = Boolean(localItem.has_hand_descriptor && localItem.hand_descriptor);
    const remoteHasHand = Boolean(remoteItem.has_hand_descriptor && remoteItem.hand_descriptor);
    if (localHasHand && !remoteHasHand) {
      if (remoteFaceReset <= localFaceApproved) {
        mergedEmp.has_hand_descriptor = true;
        mergedEmp.hand_descriptor = localItem.hand_descriptor;
      }
    } else if (remoteHasHand && !localHasHand) {
      if (localFaceReset <= remoteFaceApproved) {
        mergedEmp.has_hand_descriptor = true;
        mergedEmp.hand_descriptor = remoteItem.hand_descriptor;
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

  // ── تطهير ذاتي وحصانة مطلقة للموظفين الفعليين (Self-Healing Active Employee Immunity) ──
  // أي موظف موجود في أي من الطرفين له اسم ومعرف، يتم حمايته فوراً وإسقاط أي تومبستون قديم يعارضه
  const allCurrentEmployees = [
    ...toSafeArray(localState.employees),
    ...toSafeArray(remoteState.employees)
  ];
  for (const emp of allCurrentEmployees) {
    if (!emp || typeof emp !== 'object' || !emp.name) continue;
    if (emp.id) {
      const idStr = String(emp.id).trim();
      deletedIds.delete(idStr);
      deletedIds.delete(idStr.toLowerCase());
      deletedIds.delete(`emp_${idStr}`);
      deletedIds.delete(`emp_${idStr.toLowerCase()}`);
      deletedIds.delete(`emp_del_${idStr}`);
    }
    if (emp.code !== undefined && emp.code !== null && emp.code !== '') {
      const cStr = String(emp.code).trim();
      deletedIds.delete(cStr);
      deletedIds.delete(cStr.toLowerCase());
      deletedIds.delete(`emp_${cStr}`);
      deletedIds.delete(`emp_code_${cStr}`);
      deletedIds.delete(`emp_code_${cStr.toLowerCase()}`);
    }
    if (emp.username) {
      const uStr = String(emp.username).trim().toLowerCase();
      deletedIds.delete(uStr);
      deletedIds.delete(`emp_${uStr}`);
      deletedIds.delete(`user_${uStr}`);
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

      // حماية بيانات دخول المالك من التراجع للقيم الافتراضية عند المزامنة
      if (localSettings.ownerUsername && localSettings.ownerUsername !== 'owner') {
        mergedSettings.ownerUsername = localSettings.ownerUsername;
      } else if (remoteSettings.ownerUsername && remoteSettings.ownerUsername !== 'owner') {
        mergedSettings.ownerUsername = remoteSettings.ownerUsername;
      }
      if (localSettings.ownerPassword && localSettings.ownerPassword !== 'owner123') {
        mergedSettings.ownerPassword = localSettings.ownerPassword;
      } else if (remoteSettings.ownerPassword && remoteSettings.ownerPassword !== 'owner123') {
        mergedSettings.ownerPassword = remoteSettings.ownerPassword;
      }

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
    activeShifts: mergeActiveShifts(effectiveLocal.activeShifts, effectiveRemote.activeShifts, mergedShifts, { deletedIds }),
    branchDirectives: mergeArrays(effectiveLocal.branchDirectives, effectiveRemote.branchDirectives, { prefix: 'bdir', deletedIds }),
    adminDirectives: mergeArrays(effectiveLocal.adminDirectives, effectiveRemote.adminDirectives, { prefix: 'adir', deletedIds }),
    _notificationsClearedAt: effectiveLocal._notificationsClearedAt || effectiveRemote._notificationsClearedAt || null,
    _wipedAt: isRemoteWipeNewer ? effectiveRemote._wipedAt : (isLocalWipeNewer ? effectiveLocal._wipedAt : (effectiveRemote._wipedAt || effectiveLocal._wipedAt || null)),
    _deletedIds: Array.from(deletedIds).slice(-3000)
  };
}
