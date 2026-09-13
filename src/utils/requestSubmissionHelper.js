/**
 * requestSubmissionHelper.js
 * وحدة إرسال الطلبات الموحدة فائقة السرعة والموثوقية لجميع شاشات النظام وبوابة الموظف
 * تدمج بين:
 * 1. 0ms Optimistic UI لتحديث الواجهة فورياً
 * 2. الإرسال الذري المباشر السحابي عبر POST /api/requests/submit (< 200ms)
 * 3. الإدراج في صندوق الإرسال المحلي التزايدي (Transactional Outbox & IndexedDB)
 * 4. البث الفوري لكافة التبويبات والشاشات عبر BroadcastChannel
 * 5. المزامنة الاحتياطية الآمنة عبر saveState
 */

import { apiSubmitRequestAtomic } from './apiClient';
import { enqueueNewRequest } from './syncEngine';
import { broadcastStateChange } from './offlineSync';
import { normalizeState } from './formatters';

export async function dispatchEmployeeRequest({
  request,
  notification = null,
  specificArrayKey = null, // 'leaveRequests' | 'permissionRequests' | 'loans' | 'shiftSwaps' | 'resignationRequests'
  collectionKey = null,
  state,
  setState,
  saveState = null,
  showToast = null,
  successMessage = null,
  successToastMessage = null,
  notifyAdmin = null
}) {
  if (!request || !request.id) {
    throw new Error('Invalid request payload: missing request or request.id');
  }

  const reqBranchId = request.branchId || request.branch_id || null;
  const targetKey = specificArrayKey || collectionKey || null;
  const toastMsg = successMessage || successToastMessage || null;

  // 1. تحديث الحالة المحلية فورياً (0ms Optimistic UI)
  const updatedRequests = [request, ...(state.requests || []).filter((r) => r && r.id !== request.id)];
  let updatedSpecific = null;
  if (targetKey && Array.isArray(state[targetKey])) {
    updatedSpecific = [request, ...(state[targetKey] || []).filter((r) => r && r.id !== request.id)];
  }

  let newNotifs = [];
  if (Array.isArray(notification)) {
    newNotifs = notification.filter(Boolean);
  } else if (notification && typeof notification === 'object') {
    newNotifs = [notification];
  }
  const notifIds = new Set(newNotifs.map((n) => n.id));
  const updatedNotifications = [
    ...newNotifs,
    ...(state.notifications || []).filter((n) => n && !notifIds.has(n.id))
  ];

  const updatedState = normalizeState({
    ...state,
    requests: updatedRequests,
    ...(targetKey && updatedSpecific ? { [targetKey]: updatedSpecific } : {}),
    notifications: updatedNotifications,
    _requestsUpdatedAt: new Date().toISOString()
  });

  // تحديث واجهة المستخدم فوراً
  if (typeof setState === 'function') {
    setState(updatedState);
  }

  // بث التحديث لكافة التبويبات الأخرى المفتوحة في المتصفح أو التطبيق
  try {
    broadcastStateChange(updatedState);
  } catch {}

  if (toastMsg && typeof showToast === 'function') {
    showToast(toastMsg);
  }

  try {
    if (typeof notifyAdmin === 'function') {
      notifyAdmin(updatedState);
    }
  } catch {}

  // 2. إرسال ذري فوري ومباشر للسيرفر السحابي (< 200ms)
  let atomicSuccess = false;
  try {
    const atomicRes = await apiSubmitRequestAtomic(request, notification);
    if (atomicRes?.success) {
      atomicSuccess = true;
      console.log('✅ [Dispatch] تم استلام وحفظ الطلب ذرياً في السيرفر السحابي:', request.id);
    }
  } catch (err) {
    console.warn('⚠️ [Dispatch] تعثر الإرسال الذري السريع، سيتم الاعتماد على طابور الإرسال التزايدي:', err.message);
  }

  // 3. إدراج في صندوق الإرسال المحلي التزايدي (Transactional Outbox) لضمان عدم فقدان الطلب تحت أي ظرف
  try {
    await enqueueNewRequest(request, reqBranchId);
  } catch (err) {
    console.warn('⚠️ [Dispatch] تعثر إدراج الطلب في Outbox:', err.message);
  }

  // 4. مزامنة الحالة الكاملة الاحتياطية في الخلفية
  if (typeof saveState === 'function') {
    saveState(updatedState).catch((err) => {
      console.warn('⚠️ [Dispatch] Background full save notice:', err.message);
    });
  }

  return {
    success: true,
    requestId: request.id,
    atomicSuccess,
    updatedState
  };
}
