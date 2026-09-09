import React, { useState, useEffect } from 'react';
import { fetchCurrentIP, checkDeviceAuthorization } from '../../utils/deviceAuth';
import FaceVerificationOverlay from '../attendance/FaceVerificationOverlay';

import { useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import { uploadBiometricAttendancePhoto } from '../../utils/googleDriveService';
import { sendBiometricAttendanceEmail } from '../../utils/gmailService';
import { preWarmFaceModels } from '../../utils/faceApiHelper';
import { normalizeDigits, getRealTodayStr } from '../../utils/formatters';
import { forceClearCacheAndReload } from '../../utils/cacheManager';
import '../../kiosk-modern.css';

export default function ElectronicKioskView({
  state,
  startShift,
  pauseShift,
  resumeShift,
  stopShift,
  submitRequest,
  kioskBranchId
}) {
  const { setState, saveState } = useData();
  let uiContext = null;
  try {
    uiContext = useUI();
  } catch (e) {}
  const { kioskConfirmModal } = uiContext || {};
  const { orgSettings, employees, ipRestrictions } = state;
  const [now, setNow] = useState(Date.now());
  const [currentIp, setCurrentIp] = useState('');
  const [authStatus, setAuthStatus] = useState({ isAuthorized: true });
  
  const [inputCode, setInputCode] = useState('');
  const [matchedEmp, setMatchedEmp] = useState(null);
  const [blockedStatusModal, setBlockedStatusModal] = useState(null);
  const [kioskAlertModal, setKioskAlertModal] = useState(null);

  // Auto-countdown timer for Kiosk in-system notification modal
  useEffect(() => {
    if (!kioskAlertModal || !kioskAlertModal.isOpen || kioskAlertModal.countdown === undefined) return;
    if (kioskAlertModal.countdown <= 0) {
      if (kioskAlertModal.onClose) kioskAlertModal.onClose();
      return;
    }
    const timer = setTimeout(() => {
      setKioskAlertModal(prev => prev ? { ...prev, countdown: prev.countdown - 1 } : null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [kioskAlertModal]);

  const [pendingDirectiveModal, setPendingDirectiveModal] = useState(null);
  const [pendingDirectivesQueue, setPendingDirectivesQueue] = useState([]);
  
  const [activeAction, setActiveAction] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  
  const urlBranchParam = typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('branchId') || new URLSearchParams(window.location.search).get('branch'))
    : null;
  const cleanKioskBranchId = (kioskBranchId && String(kioskBranchId).trim()) || null;
  const cleanUrlParam = (urlBranchParam && String(urlBranchParam).trim()) || null;
  const effectiveKioskBranchId = cleanKioskBranchId || cleanUrlParam || null;
  const isGeneralKioskLink = !effectiveKioskBranchId;

  // Extract all unique assigned branches for an employee (primary + multi-branch assignments)
  const getEmployeeAssignedBranches = (emp) => {
    if (!emp) return [];
    const branchMap = new Map();

    const addBranch = (bId, fallbackName = '') => {
      if (!bId) return;
      const strId = String(bId).trim();
      if (!strId) return;
      const foundBranch = (state?.branches || []).find((b) =>
        String(b.id).trim() === strId ||
        String(b.branchCode || '').trim() === strId ||
        String(b.id).replace(/^branch_/, '') === strId.replace(/^branch_/, '')
      );
      const resolvedId = foundBranch ? String(foundBranch.id) : strId;
      if (!branchMap.has(resolvedId)) {
        branchMap.set(resolvedId, {
          id: resolvedId,
          name: foundBranch?.name || fallbackName || `فرع ${resolvedId}`,
          code: foundBranch?.branchCode || ''
        });
      }
    };

    // 0. للموظفين الإداريين: كسر القيد الجغرافي وإتاحة كافة فروع المؤسسة حصرياً
    if (emp.isAdministrative || emp.canPunchAnyBranch) {
      (state?.branches || []).forEach((b) => {
        addBranch(b.id, b.name);
      });
      return Array.from(branchMap.values());
    }

    // 1. Primary branch
    if (emp.branchId) {
      addBranch(emp.branchId, emp.branchName);
    }

    // 2. Multi-branch assignments from branchesDetails
    if (Array.isArray(emp.branchesDetails) && emp.branchesDetails.length > 0) {
      emp.branchesDetails.forEach((bd) => {
        if (bd?.branchId) {
          addBranch(bd.branchId, bd.branchName);
        }
      });
    }

    return Array.from(branchMap.values());
  };

  const assignedBranches = matchedEmp ? getEmployeeAssignedBranches(matchedEmp) : [];
  const isMultiBranchEmp = assignedBranches.length > 1;
  // Show branch selector strictly on general kiosk link AND ONLY for employees working in more than 1 branch
  const showBranchSelector = Boolean(matchedEmp && isGeneralKioskLink && isMultiBranchEmp);

  const todayStr = getRealTodayStr ? getRealTodayStr() : new Date().toISOString().slice(0, 10);
  const rawActiveShift = matchedEmp ? (state.activeShifts?.[matchedEmp.id] || state.activeShifts?.[String(matchedEmp.id)]) : null;
  const isStaleActiveShift = Boolean(rawActiveShift && rawActiveShift.date && rawActiveShift.date !== todayStr);

  // فحص سجلات اليوم لمعرفة ما إذا كانت هناك وردية مفتوحة حالياً (حضور مسجل بدون انصراف)
  const empOpenShift = matchedEmp ? (state.shifts || []).find(s => 
    (String(s.employeeId) === String(matchedEmp.id) || (matchedEmp.code && String(s.employeeCode) === String(matchedEmp.code))) &&
    s.date === todayStr &&
    Boolean(s.timeIn && s.timeIn !== '—' && (!s.timeOut || s.timeOut === '—' || s.timeOut === '') && (!s.endTime || s.endTime === '—' || s.endTime === ''))
  ) : null;

  // تحديد الوردية النشطة: إما من الوردية الحالية بالذاكرة (إذا كانت لليوم) أو من سجل الوردية المفتوحة اليوم
  const activeShift = (rawActiveShift && !isStaleActiveShift) ? rawActiveShift : (empOpenShift || null);

  useEffect(() => {
    // التحميل الاستباقي لمحرك الوجه في الكشك ليعمل فورياً عند وقوف أي موظف
    preWarmFaceModels();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function initDeviceCheck() {
      const ip = await fetchCurrentIP();
      setCurrentIp(ip);

      const auth = checkDeviceAuthorization(
        ipRestrictions || { enabled: false },
        ip
      );
      setAuthStatus(auth);
    }
    initDeviceCheck();
  }, [ipRestrictions]);

  const handleCodeSubmit = (e) => {
    e.preventDefault();
    if (!inputCode) return;
    const cleanCode = normalizeDigits(inputCode);
    const emp = (employees || []).find(e => 
      String(e.code || '').trim() === cleanCode || 
      normalizeDigits(e.code) === cleanCode || 
      String(e.id || '').trim() === cleanCode
    );

    if (emp) {
      // 1. Check if employee is Resigned or Terminated
      if (emp.status === 'تم الاستقالة' || emp.is_active === false || emp.isTerminated || emp.resignationStatus === 'approved') {
        setBlockedStatusModal({
          type: 'resigned',
          emp,
          reason: emp.terminationReason || emp.suspensionReason || 'تم إنهاء خدمة الموظف / استقالة رسمية مسجلة بالنظام.',
          date: emp.terminatedAt || null
        });
        setMatchedEmp(null);
        setInputCode('');
        return;
      }

      // 2. Check if employee's biometric or account is temporarily suspended
      if (emp.biometricSuspended || emp.punchDisabled || emp.accountSuspended || emp.status === 'معلق') {
        setBlockedStatusModal({
          type: 'suspended',
          emp,
          reason: emp.suspensionReason || 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق',
          date: emp.suspendedAt || null
        });
        setMatchedEmp(null);
        setInputCode('');
        return;
      }

      if (kioskBranchId) {
        const isAdministrative = Boolean(emp.isAdministrative || emp.canPunchAnyBranch);
        // يتم كسر قيد الفرع الجغرافي في كشك البصمة حصرياً على الموظفين الإداريين فقط
        if (!isAdministrative) {
          const cleanKioskBranch = String(kioskBranchId).trim().replace(/^branch_/, '');
          const empBranchClean = String(emp.branchId || '').trim().replace(/^branch_/, '');
          const hasSecondaryBranch = Array.isArray(emp.branchesDetails) && emp.branchesDetails.some(b => 
            String(b?.branchId || '').trim().replace(/^branch_/, '') === cleanKioskBranch
          );
          const belongsToBranch = empBranchClean === cleanKioskBranch || hasSecondaryBranch;
          if (!belongsToBranch) {
            setKioskAlertModal({
              isOpen: true,
              type: 'error',
              title: 'غير مصرح بالدخول',
              subtitle: emp.name,
              note: 'هذا الموظف غير مسجل أو غير مسموح له بتسجيل البصمة في هذا الفرع.',
              countdown: 5,
              onClose: () => setKioskAlertModal(null)
            });
            setMatchedEmp(null);
            setInputCode('');
            return;
          }
        }
      }

      const empBiometricType = emp.preferred_biometric || orgSettings?.biometricType || 'face';
      const isHand = empBiometricType === 'hand';

      if (isHand) {
        if (!emp.has_hand_descriptor && !emp.hand_descriptor) {
          setKioskAlertModal({
            isOpen: true,
            type: 'warning',
            title: 'بصمة اليد غير مسجلة',
            subtitle: emp.name,
            note: 'هذا الموظف ليس لديه بصمة يد مسجلة بالنظام. يرجى مراجعة إدارة الموارد البشرية.',
            countdown: 5,
            onClose: () => setKioskAlertModal(null)
          });
          return;
        }
      } else {
        if (!emp.has_face_descriptor && !emp.face_descriptor) {
          setKioskAlertModal({
            isOpen: true,
            type: 'warning',
            title: 'بصمة الوجه غير مسجلة',
            subtitle: emp.name,
            note: 'هذا الموظف ليس لديه بصمة وجه مسجلة بالنظام. يرجى مراجعة إدارة الموارد البشرية.',
            countdown: 5,
            onClose: () => setKioskAlertModal(null)
          });
          return;
        }
      }
      
      const assigned = getEmployeeAssignedBranches(emp);
      const activeS = (state?.activeShifts?.[emp.id] || state?.activeShifts?.[String(emp.id)]);
      let defaultBranchId = '';
      if (activeS && activeS.branchId) {
        defaultBranchId = String(activeS.branchId);
      } else if (effectiveKioskBranchId) {
        defaultBranchId = String(effectiveKioskBranchId);
      } else if (assigned.length > 0) {
        defaultBranchId = String(assigned[0].id);
      } else {
        defaultBranchId = String(emp.branchId || '');
      }
      setSelectedBranchId(defaultBranchId);
      setMatchedEmp(emp);

      // Check if there is an active unconfirmed directive requiring kiosk confirmation
      // 1. Admin Directives (Higher Management)
      const activeAdminDirs = (state?.adminDirectives || []).filter(d => d.status !== 'archived' && d.requireKioskConfirm !== false);
      const unconfirmedAdmin = activeAdminDirs.filter(d => {
        const matchesScope = d.scope === 'all' ||
          (d.scope === 'branch' && (
            String(d.targetBranchId) === String(defaultBranchId) ||
            String(d.targetBranchId) === String(emp.branchId) ||
            (kioskBranchId && String(d.targetBranchId) === String(kioskBranchId)) ||
            (Array.isArray(emp.branchesDetails) && emp.branchesDetails.some(bd => String(bd?.branchId) === String(d.targetBranchId)))
          )) ||
          (d.scope === 'employee' && (
            String(d.targetEmployeeId) === String(emp.id) ||
            (d.targetEmployeeCode && String(d.targetEmployeeCode) === String(emp.code)) ||
            (d.targetEmployeeId && String(d.targetEmployeeId) === String(emp.code))
          )) ||
          (d.scope === 'job' && (
            String(d.targetJobTitle || '').trim().toLowerCase() === String(emp.jobTitle || '').trim().toLowerCase() ||
            String(emp.jobTitle || '').trim().toLowerCase().includes(String(d.targetJobTitle || '').trim().toLowerCase())
          ));
        if (!matchesScope) return false;
        const alreadyConfirmed = (d.readConfirmations || []).some(c => 
          String(c.employeeId) === String(emp.id) || (emp.code && String(c.employeeCode) === String(emp.code))
        );
        return !alreadyConfirmed;
      }).map(d => ({ ...d, sourceType: 'admin', sourceTitle: '👑 الإدارة العليا' }));

      // 2. Branch Directives (Branch Manager)
      const activeBranchDirs = (state?.branchDirectives || []).filter(d => d.status !== 'archived' && d.requireKioskConfirm !== false);
      const unconfirmedBranch = activeBranchDirs.filter(d => {
        // A. Employee-specific target
        if (d.scope === 'employee') {
          const isTargetEmp = (d.targetEmployeeId && String(d.targetEmployeeId) === String(emp.id)) ||
                              (d.targetEmployeeCode && String(d.targetEmployeeCode) === String(emp.code)) ||
                              (d.targetEmployeeId && String(d.targetEmployeeId) === String(emp.code));
          if (!isTargetEmp) return false;
        } else {
          // B. Branch check (Matches employee's main branch, kiosk branch, default branch, or any secondary branch)
          const dBranchStr = String(d.branchId || '').trim();
          const cleanDBranch = dBranchStr.replace(/^branch_/, '');
          
          const empMainBranchStr = String(emp.branchId || '').trim();
          const cleanEmpMain = empMainBranchStr.replace(/^branch_/, '');
          
          const kioskBranchStr = String(kioskBranchId || '').trim();
          const cleanKiosk = kioskBranchStr.replace(/^branch_/, '');
          
          const defaultBranchStr = String(defaultBranchId || '').trim();
          const cleanDefault = defaultBranchStr.replace(/^branch_/, '');

          const isMainBranch = cleanDBranch && cleanEmpMain && cleanDBranch === cleanEmpMain;
          const isKioskBranch = cleanDBranch && cleanKiosk && cleanDBranch === cleanKiosk;
          const isDefaultBranch = cleanDBranch && cleanDefault && cleanDBranch === cleanDefault;
          
          const isSecondaryBranch = Array.isArray(emp.branchesDetails) && emp.branchesDetails.some(bd => {
            const bIdStr = String(bd?.branchId || '').trim().replace(/^branch_/, '');
            return bIdStr && bIdStr === cleanDBranch;
          });

          const matchesBranch = isMainBranch || isKioskBranch || isDefaultBranch || isSecondaryBranch;
          if (!matchesBranch) return false;

          // C. Scope check for job
          if (d.scope === 'job') {
            const targetJob = String(d.targetJobTitle || '').trim().toLowerCase();
            const empJob = String(emp.jobTitle || '').trim().toLowerCase();
            const matchesJob = targetJob === empJob || empJob.includes(targetJob) || targetJob.includes(empJob);
            if (!matchesJob) return false;
          }
        }

        // D. Has employee already confirmed reading this directive?
        const alreadyConfirmed = (d.readConfirmations || []).some(c => 
          String(c.employeeId) === String(emp.id) || (emp.code && String(c.employeeCode) === String(emp.code))
        );
        return !alreadyConfirmed;
      }).map(d => ({ ...d, sourceType: 'branch', sourceTitle: `🏢 مدير الفرع (${d.branchName || 'الفرع'})` }));

      // Put urgent directives first
      const allUnconfirmed = [...unconfirmedBranch, ...unconfirmedAdmin].sort((a, b) => {
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
        if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
        return 0;
      });

      if (allUnconfirmed.length > 0) {
        setPendingDirectiveModal(allUnconfirmed[0]);
        setPendingDirectivesQueue(allUnconfirmed.slice(1));
      } else {
        setPendingDirectiveModal(null);
        setPendingDirectivesQueue([]);
      }
    } else {
      setKioskAlertModal({
        isOpen: true,
        type: 'error',
        title: 'كود غير صحيح',
        note: 'كود الموظف المدخل غير صحيح أو غير مسجل في قاعدة البيانات.',
        countdown: 4,
        onClose: () => setKioskAlertModal(null)
      });
      setMatchedEmp(null);
      setPendingDirectiveModal(null);
      setPendingDirectivesQueue([]);
    }
  };

  const handleActionClick = (action) => {
    if (action === 'shift_start' && activeShift) {
      setKioskAlertModal({
        isOpen: true,
        type: 'warning',
        title: 'تنبيه بدء الوردية',
        subtitle: `${matchedEmp?.name || ''}`,
        note: 'لديك وردية عمل مفتوحة بالفعل لهذا اليوم. يرجى تسجيل الانصراف أولاً قبل بدء وردية جديدة.',
        countdown: 5,
        onClose: () => setKioskAlertModal(null)
      });
      return;
    }
    if (action === 'shift_end' && !activeShift) {
      setKioskAlertModal({
        isOpen: true,
        type: 'warning',
        title: 'تنبيه تسجيل الانصراف',
        subtitle: `${matchedEmp?.name || ''}`,
        note: 'ليس لديك وردية عمل نشطة ومفتوحة لتسجيل الانصراف.',
        countdown: 5,
        onClose: () => setKioskAlertModal(null)
      });
      return;
    }
    if (action === 'break_start' && (!activeShift || activeShift.isPaused)) {
      setKioskAlertModal({
        isOpen: true,
        type: 'warning',
        title: 'تنبيه فترة الاستراحة (البريك)',
        subtitle: `${matchedEmp?.name || ''}`,
        note: !activeShift ? 'يجب بدء الوردية أولاً قبل أخذ استراحة.' : 'أنت في فترة استراحة بالفعل.',
        countdown: 5,
        onClose: () => setKioskAlertModal(null)
      });
      return;
    }
    if (action === 'break_end' && (!activeShift || !activeShift.isPaused)) {
      setKioskAlertModal({
        isOpen: true,
        type: 'warning',
        title: 'تنبيه العودة من الاستراحة',
        subtitle: `${matchedEmp?.name || ''}`,
        note: 'أنت لست في فترة استراحة حالياً.',
        countdown: 5,
        onClose: () => setKioskAlertModal(null)
      });
      return;
    }
    setActiveAction(action);
  };

  const onVerifySuccess = (actionType) => {
    setActiveAction(null);
    executeAction(actionType);
  };

  const onVerifyFailed = (actionType, photoUrl) => {
    setActiveAction(null);
    const currentEmp = matchedEmp;
    if (!currentEmp) return;

    const actionLabels = {
      shift_start: 'تسجيل دخول (بداية الوردية)',
      shift_end: 'تسجيل خروج (نهاية الوردية)',
      break_start: 'بدء استراحة (بريك)',
      break_end: 'انتهاء استراحة (بريك)'
    };
    const actionBadges = {
      shift_start: '🟢 بصمة دخول',
      shift_end: '🔴 بصمة خروج',
      break_start: '☕ بدء بريك',
      break_end: '⏱️ انتهاء بريك'
    };
    const actionTitles = {
      shift_start: 'تم توثيق 🟢 بصمة دخول وبدء الوردية بنجاح!',
      shift_end: 'تم توثيق 🔴 بصمة خروج وإنهاء الوردية بنجاح!',
      break_start: 'تم توثيق ☕ بدء الاستراحة (البريك) بنجاح!',
      break_end: 'تم توثيق ⏱️ انتهاء الاستراحة واستئناف العمل بنجاح!'
    };
    const actionNotes = {
      shift_start: '✅ تم بدء الوردية وتسجيل موعد الحضور فورياً من لحظة التقاط الصورة. تم إرسال الصورة لمدير الفرع والإدارة العليا للتأكيد والمطابقة.',
      shift_end: '✅ تم إنهاء الوردية وتسجيل موعد الانصراف فورياً من لحظة التقاط الصورة. تم إرسال الصورة لمدير الفرع والإدارة العليا للتأكيد والمطابقة.',
      break_start: '✅ تم تسجيل بدء الاستراحة (البريك) فورياً من لحظة التقاط الصورة. تم إرسال الصورة للإدارة ومدير الفرع.',
      break_end: '✅ تم تسجيل استئناف العمل فورياً من لحظة التقاط الصورة. تم إرسال الصورة للإدارة ومدير الفرع.'
    };

    const actionLabel = actionLabels[actionType] || actionType;
    const actionBadge = actionBadges[actionType] || '📸 بصمة بالصورة';
    const modalTitle = actionTitles[actionType] || `تم توثيق ${actionBadge} بنجاح!`;
    const modalNote = actionNotes[actionType] || '✅ تم تسجيل الإجراء فورياً من لحظة التقاط الصورة. تم إرسال الصورة للإدارة للتأكيد والمطابقة.';

    const effectiveBranchId = selectedBranchId || currentEmp?.branchId || kioskBranchId;
    const branchObj = (state?.branches || []).find(b => String(b.id) === String(effectiveBranchId)) || state?.branches?.[0];
    const branchName = branchObj ? branchObj.name : 'الفرع الرئيسي';

    const now = new Date();
    const dateStr = getRealTodayStr ? getRealTodayStr() : now.toISOString().slice(0, 10);
    const punchTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const displayTime = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    const requestId = 'REQ-BIO-' + now.getTime();
    const shiftId = 'shift_bio_' + now.getTime() + '_' + Math.random().toString(36).substr(2, 4);

    // ⚡ 1. إظهار نافذة التأكيد الفورية في النظام (0ms Delay)
    setKioskAlertModal({
      isOpen: true,
      type: 'success',
      title: modalTitle,
      subtitle: `الموظف: ${currentEmp.name} (كود: ${currentEmp.code || currentEmp.id}) · ${branchName}`,
      timeStr: `${displayTime} (${punchTime})`,
      dateStr,
      actionBadge,
      driveSaved: false,
      note: modalNote,
      countdown: 6,
      onClose: () => {
        setKioskAlertModal(null);
        setMatchedEmp(null);
        setInputCode('');
        setSelectedBranchId(null);
      }
    });

    // ⚡ 2. التنفيذ الفوري الذري الشامل لبدء/إنهاء الوردية وحفظ الطلب والإشعار معاً دون أي تعارض زمني
    const requestData = {
      id: requestId,
      shiftId: shiftId,
      type: 'biometric_verification',
      requestType: 'biometric_verification',
      typeLabel: `اعتماد حضور بالصورة: ${actionBadge}`,
      employeeId: currentEmp.id,
      employeeCode: currentEmp.code || '',
      employeeName: currentEmp.name || '',
      branchId: effectiveBranchId,
      branchName: branchName,
      targetAction: actionType,
      actionType: actionType,
      actionLabel: actionLabel,
      actionBadge: actionBadge,
      date: dateStr,
      time: punchTime,
      displayTime: displayTime,
      timestamp: now.toISOString(),
      epoch: now.getTime(),
      createdAt: now.toISOString(),
      status: 'pending',
      requiresBranchManager: true,
      requiresSuperAdmin: true,
      branchApproved: false,
      adminApproved: false,
      details: `طلب اعتماد ${actionBadge} (${actionLabel}) بالصورة الحية. وقت التوثيق والتنفيذ: ${displayTime} (${punchTime}) بتاريخ ${dateStr}.`,
      notes: `تم التقاط صورة حية للموظف في تمام ${displayTime} وإرسالها للإدارة ومدير الفرع للمطابقة والاعتماد. تم تنفيذ الإجراء فورياً في نفس لحظة إرسال الطلب.`,
      photoUrl: photoUrl || null,
      drivePhotoUrl: null,
      driveFileId: null
    };

    const newNotif = {
      id: 'NOTIF-BIO-' + now.getTime(),
      type: 'biometric_verification',
      targetRole: 'branch_and_admin',
      branchId: effectiveBranchId,
      title: `📸 طلب اعتماد [${actionBadge}]: ${currentEmp.name}`,
      message: `طلب اعتماد ${actionBadge} (${actionLabel}) بالصورة للموظف ${currentEmp.name} في تمام الساعة ${displayTime} بتاريخ ${dateStr}. تم تسجيل وتنفيذ الإجراء فورياً.`,
      requestId: requestId,
      employeeId: currentEmp.id,
      employeeName: currentEmp.name,
      targetAction: actionType,
      actionBadge: actionBadge,
      time: punchTime,
      date: dateStr,
      photoUrl: photoUrl || null,
      drivePhotoUrl: null,
      createdAt: now.toISOString(),
      read: false,
      readBy: []
    };

    let updatedActiveShifts = { ...(state?.activeShifts || {}) };
    let updatedShifts = [...(state?.shifts || [])];

    if (actionType === 'shift_start') {
      // إغلاق تلقائي لأي وردية نشطة قديمة معلقة من يوم سابق
      const prevActive = updatedActiveShifts[currentEmp.id] || updatedActiveShifts[String(currentEmp.id)];
      if (prevActive && prevActive.date && prevActive.date !== dateStr) {
        const staleShiftId = 'stale_' + now.getTime();
        const bObjOld = (state?.branches || []).find(b => String(b.id) === String(prevActive.branchId || effectiveBranchId));
        updatedShifts = [
          {
            id: staleShiftId,
            employeeId: currentEmp.id,
            employeeCode: currentEmp.code || '',
            employeeName: currentEmp.name || '',
            branchId: prevActive.branchId || effectiveBranchId,
            branchName: bObjOld?.name || '',
            date: prevActive.date,
            timeIn: prevActive.timeIn,
            timeOut: '17:00',
            hours: parseFloat(currentEmp.workHoursPerDay) || 8,
            actualWorkedHours: parseFloat(currentEmp.workHoursPerDay) || 8,
            scheduledHours: parseFloat(currentEmp.workHoursPerDay) || 8,
            regularHours: parseFloat(currentEmp.workHoursPerDay) || 8,
            overtimeHours: 0,
            overtimeStatus: 'none',
            breakHours: 0,
            note: 'إغلاق تلقائي لوردية سابقة لم يتم تسجيل انصرافها',
            statusLabel: 'حضور حي',
            createdAt: now.toISOString()
          },
          ...updatedShifts
        ];
      }

      // 1. تسجيل الوردية النشطة
      const newActiveShift = {
        shiftId: shiftId,
        branchId: effectiveBranchId,
        branchName: branchName,
        date: dateStr,
        timeIn: punchTime,
        startEpoch: now.getTime(),
        isPaused: false,
        isOnBreak: false,
        breakStartTime: null,
        pauseStartEpoch: null,
        accumulatedPauseMs: 0,
        updatedAt: now.getTime(),
        punchType: 'photo_attendance',
        photoUrl: photoUrl || null,
        statusLabel: 'حضور بالصورة (بانتظار الاعتماد)',
        requestId: requestId
      };
      updatedActiveShifts[currentEmp.id] = newActiveShift;
      updatedActiveShifts[String(currentEmp.id)] = newActiveShift;

      // 2. إدراج سجل الحضور فورياً في قائمة الحضور وشيت الورديات
      const openShiftRecord = {
        id: shiftId,
        employeeId: currentEmp.id,
        employeeCode: currentEmp.code || '',
        employeeName: currentEmp.name || '',
        branchId: effectiveBranchId,
        branchName: branchName,
        date: dateStr,
        timeIn: punchTime,
        timeOut: '—',
        hours: 0,
        actualWorkedHours: 0,
        scheduledHours: parseFloat(currentEmp.workHoursPerDay) || 8,
        regularHours: 0,
        overtimeHours: 0,
        overtimeStatus: 'none',
        breakHours: 0,
        punchType: 'photo_attendance',
        photoUrl: photoUrl || null,
        requestId: requestId,
        statusLabel: 'حضور بالصورة (بانتظار الاعتماد)',
        note: `تسجيل حضور بالصورة في تمام ${displayTime} (${punchTime}) بانتظار اعتماد الإدارة`,
        createdAt: now.toISOString()
      };
      updatedShifts = [openShiftRecord, ...updatedShifts];

    } else if (actionType === 'shift_end') {
      const active = updatedActiveShifts[currentEmp.id] || updatedActiveShifts[String(currentEmp.id)];
      
      const openShiftIdx = updatedShifts.findIndex(s =>
        (String(s.employeeId) === String(currentEmp.id) || (currentEmp.code && String(s.employeeCode) === String(currentEmp.code))) &&
        s.date === (active?.date || dateStr) &&
        (!s.timeOut || s.timeOut === '—' || s.timeOut === '')
      );

      const effectiveTimeIn = active?.timeIn || (openShiftIdx >= 0 ? updatedShifts[openShiftIdx].timeIn : '09:00');
      const effectiveShiftDate = active?.date || (openShiftIdx >= 0 ? updatedShifts[openShiftIdx].date : dateStr);
      const targetShiftId = active?.shiftId || (openShiftIdx >= 0 ? updatedShifts[openShiftIdx].id : shiftId);

      // حساب ساعات العمل والبريك والإضافي بدقة
      const [inH, inM] = effectiveTimeIn.split(':').map(Number);
      const [outH, outM] = punchTime.split(':').map(Number);
      let diffMinutes = ((outH || 0) * 60 + (outM || 0)) - ((inH || 0) * 60 + (inM || 0));
      if (diffMinutes < 0) diffMinutes += 24 * 60;
      const totalElapsedHours = Math.round((diffMinutes / 60) * 100) / 100;

      let currentPauseMs = active?.accumulatedPauseMs || 0;
      if (active?.isPaused && active?.pauseStartEpoch) {
        currentPauseMs += (now.getTime() - active.pauseStartEpoch);
      }
      const trackedBreak = Math.round((currentPauseMs / 3600000) * 100) / 100;
      const configuredBreak = parseFloat(currentEmp?.breakHours || currentEmp?.defaultBreakHours || currentEmp?.branchesDetails?.[0]?.breakHours) || 0;
      const effectiveBreak = trackedBreak > 0 ? trackedBreak : (totalElapsedHours > configuredBreak ? configuredBreak : 0);
      const netHours = Math.max(0, Math.round((totalElapsedHours - effectiveBreak) * 100) / 100);

      let scheduledHours = parseFloat(currentEmp?.workHoursPerDay) || 8;
      let regularHours = netHours;
      let overtimeHours = 0;
      let overtimeStatus = 'none';

      if (netHours > scheduledHours) {
        overtimeHours = Math.round((netHours - scheduledHours) * 100) / 100;
        regularHours = scheduledHours;
        overtimeStatus = 'pending';
      }

      // حذف الوردية من الورديات النشطة
      delete updatedActiveShifts[currentEmp.id];
      delete updatedActiveShifts[String(currentEmp.id)];

      const closedShiftData = {
        id: targetShiftId,
        employeeId: currentEmp.id,
        employeeCode: currentEmp.code || '',
        employeeName: currentEmp.name || '',
        branchId: effectiveBranchId,
        branchName: branchName,
        date: effectiveShiftDate,
        timeIn: effectiveTimeIn,
        timeOut: punchTime,
        hours: overtimeStatus === 'pending' ? regularHours : netHours,
        actualWorkedHours: netHours,
        scheduledHours,
        regularHours,
        overtimeHours,
        overtimeStatus,
        breakHours: effectiveBreak,
        punchType: 'photo_attendance',
        photoUrl: photoUrl || null,
        requestId: requestId,
        statusLabel: 'انصراف بالصورة (بانتظار الاعتماد)',
        note: `تسجيل انصراف بالصورة في تمام ${displayTime} (${punchTime}) - الساعات: ${netHours} س (بانتظار اعتماد الإدارة)`,
        updatedAt: now.toISOString()
      };

      if (openShiftIdx >= 0) {
        updatedShifts[openShiftIdx] = {
          ...updatedShifts[openShiftIdx],
          ...closedShiftData
        };
      } else {
        updatedShifts = [{ ...closedShiftData, createdAt: now.toISOString() }, ...updatedShifts];
      }

      requestData.shiftId = targetShiftId;

    } else if (actionType === 'break_start') {
      const active = updatedActiveShifts[currentEmp.id] || updatedActiveShifts[String(currentEmp.id)];
      if (active) {
        const pausedShift = {
          ...active,
          isPaused: true,
          isOnBreak: true,
          breakStartTime: punchTime,
          pauseStartEpoch: now.getTime(),
          updatedAt: now.getTime()
        };
        updatedActiveShifts[currentEmp.id] = pausedShift;
        updatedActiveShifts[String(currentEmp.id)] = pausedShift;
      }
    } else if (actionType === 'break_end') {
      const active = updatedActiveShifts[currentEmp.id] || updatedActiveShifts[String(currentEmp.id)];
      if (active) {
        const pauseDuration = now.getTime() - (active.pauseStartEpoch || now.getTime());
        const resumedShift = {
          ...active,
          isPaused: false,
          isOnBreak: false,
          breakStartTime: null,
          pauseStartEpoch: null,
          accumulatedPauseMs: (active.accumulatedPauseMs || 0) + pauseDuration,
          updatedAt: now.getTime()
        };
        updatedActiveShifts[currentEmp.id] = resumedShift;
        updatedActiveShifts[String(currentEmp.id)] = resumedShift;
      }
    }

    // ⚡ 3. الحفظ الذري الموحد للحالة (Atomic State Update) يضمن عدم ضياع أي بيان
    const finalState = {
      ...state,
      shifts: updatedShifts,
      activeShifts: updatedActiveShifts,
      requests: [requestData, ...(state?.requests || [])],
      notifications: [newNotif, ...(state?.notifications || [])],
      _requestsUpdatedAt: now.toISOString(),
      _notificationsUpdatedAt: now.toISOString()
    };

    if (setState) {
      setState(finalState);
    }
    if (saveState) {
      saveState(finalState).catch(err => console.error('[Kiosk Photo Attendance] Save error:', err));
    }
    if (submitRequest) {
      submitRequest(requestData);
    }

    // ⚡ 4. المهام الخلفية المستقلة تماماً (رفع Drive وإشعارات Gmail)
    (async () => {
      let driveResult = null;
      const driveConfig = orgSettings?.googleDrive || state?.orgSettings?.googleDrive;
      if (driveConfig && driveConfig.serviceUrl && photoUrl) {
        try {
          driveResult = await uploadBiometricAttendancePhoto({
            employee: currentEmp,
            photoDataUrl: photoUrl,
            actionType,
            driveConfig
          });
          if (driveResult && driveResult.fileUrl) {
            // تحديث رابط الصورة في الطلب والإشعار بالخلفية
            if (setState) {
              setState(prev => ({
                ...prev,
                requests: (prev?.requests || []).map(r => r.id === requestId ? { ...r, drivePhotoUrl: driveResult.fileUrl, driveFileId: driveResult.fileId } : r),
                notifications: (prev?.notifications || []).map(n => n.requestId === requestId ? { ...n, drivePhotoUrl: driveResult.fileUrl } : n),
                shifts: (prev?.shifts || []).map(s => s.requestId === requestId ? { ...s, drivePhotoUrl: driveResult.fileUrl } : s)
              }));
            }
          }
        } catch (driveErr) {
          console.warn('Failed to upload attendance photo to Google Drive:', driveErr);
        }
      }

      const gmailConfig = orgSettings?.gmailConfig || state?.orgSettings?.gmailConfig;
      if (gmailConfig && gmailConfig.serviceUrl && (gmailConfig.notifyOnAttendanceAnomaly !== false || gmailConfig.notifyOnNewRequest !== false)) {
        sendBiometricAttendanceEmail({
          gmailConfig,
          empName: currentEmp.name,
          empCode: currentEmp.code,
          branchName,
          actionType,
          actionLabel,
          timeStr: `${displayTime} (${punchTime})`,
          dateStr,
          photoDataUrl: photoUrl,
          driveUrl: driveResult?.fileUrl
        }).catch(err => console.warn('Gmail biometric notification failed:', err));
      }
    })();
  };

  const executeAction = async (actionType) => {
    if (!matchedEmp) return;
    const empId = matchedEmp.id;
    const empName = matchedEmp.name;
    const effectiveBranchId = selectedBranchId || matchedEmp.branchId || kioskBranchId;
    const branchObj = (state?.branches || []).find(b => String(b.id) === String(effectiveBranchId)) || state?.branches?.[0];
    const branchName = branchObj ? branchObj.name : 'الفرع';

    // إعادة تهيئة المتغيرات فورياً حتى يكون الكشك جاهزاً للعملية التالية مباشرة
    setMatchedEmp(null);
    setInputCode('');
    setSelectedBranchId(null);

    try {
      let res = null;
      if (actionType === 'shift_start') {
        if (startShift) res = await startShift(empId, 'kiosk', effectiveBranchId);
      } else if (actionType === 'break_start') {
        if (pauseShift) res = await pauseShift(empId, 'kiosk');
      } else if (actionType === 'break_end') {
        if (resumeShift) res = await resumeShift(empId, 'kiosk');
      } else if (actionType === 'shift_end') {
        if (stopShift) res = await stopShift(empId, 'kiosk');
      }

      if (res && res.success === false) {
        setKioskAlertModal({
          isOpen: true,
          type: 'warning',
          title: 'تنبيه تسجيل الوردية',
          subtitle: `${empName} · ${branchName}`,
          note: res.reason || 'تعذر إتمام الإجراء بنجاح.',
          countdown: 6,
          onClose: () => setKioskAlertModal(null)
        });
        return;
      }
    } catch (err) {
      console.error('Kiosk punch execution error:', err);
      setKioskAlertModal({
        isOpen: true,
        type: 'error',
        title: 'خطأ في حفظ الوردية',
        subtitle: `${empName} · ${branchName}`,
        note: 'حدث خطأ أثناء حفظ الوردية. يرجى المحاولة مرة أخرى أو مراجعة الاتصال.',
        countdown: 6,
        onClose: () => setKioskAlertModal(null)
      });
    }
  };

  if (!authStatus.isAuthorized) {
    return (
      <div className="kiosk-modern-container fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="kiosk-glass-panel" style={{ textAlign: 'center', border: '2px solid #ef4444' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>🚫</div>
          <h2 style={{ margin: '0 0 12px 0', color: '#991b1b' }}>غير مصرح بالدخول من الشبكة الحالية</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '24px' }}>
            {authStatus.message}
          </p>
          <div className="ip-box" style={{ padding: '16px', borderRadius: '12px', textAlign: 'right', fontSize: '0.85rem', marginBottom: '24px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div>عنوان الـ IP الحالي لجهازك: <strong style={{ color: '#059669' }}>{currentIp}</strong></div>
          </div>
          <button className="kiosk-glass-submit" onClick={() => window.location.reload()}>
            🔄 تحديث الصفحة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="kiosk-modern-container" 
      style={{
        minHeight: '100vh',
        width: '100vw',
        background: 'linear-gradient(135deg, #0f172a 0%, #0d9488 50%, #0284c7 100%)',
        color: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
        fontFamily: 'Tajawal, Cairo, sans-serif',
        boxSizing: 'border-box',
        margin: 0,
        position: 'relative'
      }}
    >
      <div 
        className="kiosk-content-wrapper"
        style={{
          zIndex: 10,
          width: '100%',
          maxWidth: '580px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          margin: '0 auto'
        }}
      >
        {/* Modern Glass Header with Clock */}
        <div 
          className="kiosk-glass-header"
          style={{
            position: 'relative',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.7)',
            borderRadius: '28px',
            padding: '1.75rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '0.5rem',
            boxShadow: '0 20px 40px -15px rgba(0,0,0,0.25)'
          }}
        >
          {/* Quick Clear Cache & Hard Reload Button */}
          <button
            type="button"
            onClick={() => {
              if (window.confirm('هل تريد مسح كاش المتصفح وإعادة تحميل الكشك بالكامل لجلب أحدث التحديثات؟\n(Ctrl + Shift + R)')) {
                forceClearCacheAndReload({ notifyUser: true });
              }
            }}
            title="مسح الكاش وإعادة التحميل القسري (Ctrl+Shift+R أو Ctrl+F5)"
            style={{
              position: 'absolute',
              top: '12px',
              left: '14px',
              background: 'rgba(241, 245, 249, 0.9)',
              border: '1px solid #cbd5e1',
              color: '#475569',
              borderRadius: '10px',
              padding: '5px 9px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              zIndex: 5,
              transition: 'all 0.15s ease'
            }}
          >
            <span>🧹</span>
            <span>تحديث الكاش</span>
          </button>
          {orgSettings?.logoUrl && (
            <div style={{ marginBottom: '6px' }}>
              <img
                src={orgSettings.logoUrl}
                alt="شعار المؤسسة"
                style={{
                  maxHeight: '60px',
                  maxWidth: '160px',
                  objectFit: 'contain',
                  background: '#ffffff',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                }}
              />
            </div>
          )}
          <div>
            <h1 
              className="kiosk-clock-main"
              style={{
                fontFamily: 'Cairo, sans-serif',
                fontSize: 'clamp(2.8rem, 8vw, 4.2rem)',
                fontWeight: 900,
                letterSpacing: '1px',
                background: 'linear-gradient(135deg, #0f172a 0%, #0d9488 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                margin: 0,
                lineHeight: 1.1,
                direction: 'ltr',
                display: 'inline-block'
              }}
            >
              {new Date(now).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </h1>
            <div 
              className="kiosk-date-sub"
              style={{
                fontSize: 'clamp(1rem, 3.5vw, 1.25rem)',
                color: '#059669',
                fontWeight: 700,
                fontFamily: 'Tajawal, sans-serif'
              }}
            >
              {new Date(now).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div style={{ color: '#64748B', fontSize: '0.9rem', fontWeight: 600 }}>
            {orgSettings?.orgName || 'منصة الحضور الإلكترونية'} | IP: {currentIp}
          </div>
        </div>

        {/* Dynamic Panel */}
        <div 
          className="kiosk-glass-panel"
          style={{
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(25px)',
            WebkitBackdropFilter: 'blur(25px)',
            border: '1px solid rgba(255, 255, 255, 0.8)',
            borderRadius: '32px',
            padding: '2.5rem 2rem',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {!matchedEmp ? (
            <div className="kiosk-form" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'fadeIn 0.5s ease-out' }}>
              <div style={{ fontSize: '3.8rem', textAlign: 'center', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.1))' }}>
                🧑‍💼
              </div>
              <h2 style={{ textAlign: 'center', margin: 0, fontSize: '1.8rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#0f172a' }}>تسجيل الحضور والانصراف</h2>
              <p style={{ textAlign: 'center', color: '#64748B', marginTop: '-10px', fontSize: '1.05rem' }}>يرجى إدخال كود الموظف الخاص بك للبدء</p>
              
              <form onSubmit={handleCodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
                <input 
                  type="password" 
                  placeholder="أدخل كود الموظف..." 
                  className="kiosk-glass-input"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#f8fafc',
                    border: '2px solid #cbd5e1',
                    borderRadius: '18px',
                    padding: '1.2rem 1.5rem',
                    fontSize: '1.6rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    textAlign: 'center',
                    letterSpacing: '6px',
                    outline: 'none',
                    direction: 'ltr',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)'
                  }}
                />
                <button 
                  type="submit" 
                  className="kiosk-glass-submit"
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '18px',
                    padding: '1.25rem 1.5rem',
                    fontSize: '1.35rem',
                    fontWeight: 800,
                    fontFamily: 'Cairo, Tajawal, sans-serif',
                    cursor: 'pointer',
                    boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem'
                  }}
                >
                  متابعة ➔
                </button>
              </form>
            </div>
          ) : (
            <div style={{ width: '100%', animation: 'fadeIn 0.5s ease-out' }}>
              {/* User Banner */}
              <div className="kiosk-user-banner" style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', width: '100%', paddingBottom: '1.5rem', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem' }}>
                {matchedEmp.photoUrl ? (
                  <img src={matchedEmp.photoUrl} alt="Employee Avatar" className="kiosk-user-avatar" style={{ width: '75px', height: '75px', borderRadius: '50%', border: '3px solid #10b981', objectFit: 'cover' }} />
                ) : (
                  <div className="kiosk-user-avatar" style={{ width: '75px', height: '75px', borderRadius: '50%', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem', border: '3px solid #10b981' }}>🧑‍💼</div>
                )}
                <div className="kiosk-user-info" style={{ flex: 1 }}>
                  <h3 className="kiosk-user-name" style={{ fontSize: '1.45rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', margin: 0, color: '#0f172a' }}>أهلاً بك، {matchedEmp.name}</h3>
                  <p className="kiosk-user-role" style={{ fontSize: '1rem', color: '#475569', margin: '4px 0 0 0', fontWeight: 600 }}>{matchedEmp.jobTitle}</p>
                  {(matchedEmp.isAdministrative || matchedEmp.canPunchAnyBranch) && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#e0e7ff', color: '#3730a3', padding: '4px 10px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 800, marginTop: '6px', border: '1px solid #c7d2fe' }}>
                      <span>👔</span> موظف إداري معتمد · مصرح بالبصمة في كافة الفروع
                    </div>
                  )}
                </div>
                <button 
                  className="kiosk-logout-btn" 
                  onClick={() => { setMatchedEmp(null); setInputCode(''); setSelectedBranchId(null); }}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '0.7rem 1.2rem', borderRadius: '12px', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  تغيير الموظف
                </button>
              </div>

              {/* ── Directives Interception (Admin & Branch Manager) ── */}
              {pendingDirectiveModal ? (
                <div style={{
                  background: pendingDirectiveModal.priority === 'urgent'
                    ? 'linear-gradient(135deg, #fff1f2, #ffe4e6)'
                    : 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                  border: pendingDirectiveModal.priority === 'urgent'
                    ? '2px solid #ef4444'
                    : '2px solid #f59e0b',
                  borderRadius: '20px',
                  padding: '24px 20px',
                  boxShadow: pendingDirectiveModal.priority === 'urgent'
                    ? '0 10px 30px rgba(239,68,68,0.2)'
                    : '0 10px 30px rgba(245,158,11,0.2)',
                  textAlign: 'center',
                  width: '100%'
                }}>
                  <div style={{ fontSize: '38px', marginBottom: '8px' }}>
                    {pendingDirectiveModal.priority === 'urgent' ? '🚨' : '📢'}
                  </div>

                  {/* Sender Badge */}
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 14px',
                    borderRadius: '20px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    marginBottom: '10px',
                    background: pendingDirectiveModal.sourceType === 'branch' ? '#dbeafe' : '#fef3c7',
                    color: pendingDirectiveModal.sourceType === 'branch' ? '#1e40af' : '#92400e',
                    border: pendingDirectiveModal.sourceType === 'branch' ? '1px solid #bfdbfe' : '1px solid #fde68a'
                  }}>
                    <span>{pendingDirectiveModal.sourceTitle}</span>
                  </div>

                  <h3 style={{
                    margin: '0 0 4px 0',
                    fontSize: '18px',
                    fontWeight: 900,
                    color: pendingDirectiveModal.priority === 'urgent' ? '#991b1b' : '#92400e',
                    fontFamily: 'Cairo, sans-serif'
                  }}>
                    {pendingDirectiveModal.sourceType === 'branch' ? 'توجيهات وتعليمات مدير الفرع' : 'تعليمات إدارية ملزمة من الإدارة العليا'}
                  </h3>
                  <div style={{
                    fontSize: '12.5px',
                    color: pendingDirectiveModal.priority === 'urgent' ? '#b91c1c' : '#b45309',
                    fontWeight: 700,
                    marginBottom: '16px'
                  }}>
                    مطلوب قراءة القرار والموافقة عليه قبل إتاحة تسجيل البصمة
                  </div>
                  
                  <div style={{
                    background: '#ffffff',
                    border: pendingDirectiveModal.priority === 'urgent' ? '1.5px solid #fecdd3' : '1.5px solid #fde68a',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    textAlign: 'right',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    marginBottom: '16px',
                    fontSize: '13.5px',
                    color: '#1e293b',
                    lineHeight: '1.7'
                  }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '6px', fontSize: '15px' }}>
                      📌 {pendingDirectiveModal.title}
                    </div>
                    <div style={{ whiteSpace: 'pre-line' }}>
                      {pendingDirectiveModal.content}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-start"
                    onClick={async () => {
                      const newConfirmation = {
                        employeeId: matchedEmp.id,
                        employeeName: matchedEmp.name,
                        employeeCode: matchedEmp.code,
                        confirmedAt: new Date().toISOString()
                      };

                      let updatedState = { ...state };

                      if (pendingDirectiveModal.sourceType === 'branch') {
                        // Update branchDirectives
                        const updatedBranchDirs = (state?.branchDirectives || []).map(d => {
                          if (d.id === pendingDirectiveModal.id) {
                            const newConfirmations = [...(d.readConfirmations || []), newConfirmation];
                            const allEmps = (state?.employees || []).filter(e => {
                              if (e.status === 'تم الاستقالة' || e.is_active === false) return false;
                              const matchesMain = String(e.branchId) === String(d.branchId);
                              const matchesSecondary = e.branchesDetails && e.branchesDetails.some(bd => String(bd.branchId) === String(d.branchId));
                              return matchesMain || matchesSecondary;
                            });

                            let targeted = allEmps;
                            if (d.scope === 'employee') {
                              targeted = allEmps.filter(e => String(e.id) === String(d.targetEmployeeId));
                            } else if (d.scope === 'job') {
                              const jTitle = String(d.targetJobTitle || '').trim().toLowerCase();
                              targeted = allEmps.filter(e => String(e.jobTitle || '').trim().toLowerCase() === jTitle);
                            }

                            const uniqueConfirmedIds = new Set(newConfirmations.map(c => String(c.employeeId)));
                            const allRead = targeted.length > 0 && targeted.every(e => uniqueConfirmedIds.has(String(e.id)));

                            return {
                              ...d,
                              readConfirmations: newConfirmations,
                              status: allRead ? 'archived' : 'active',
                              archivedAt: allRead ? new Date().toISOString() : null
                            };
                          }
                          return d;
                        });
                        updatedState = { ...updatedState, branchDirectives: updatedBranchDirs };
                      } else {
                        // Update adminDirectives
                        const updatedAdminDirs = (state?.adminDirectives || []).map(d => {
                          if (d.id === pendingDirectiveModal.id) {
                            const newConfirmations = [...(d.readConfirmations || []), newConfirmation];
                            const allEmps = (state?.employees || []).filter(e => e.status !== 'تم الاستقالة' && e.is_active !== false);
                            let targeted = allEmps;
                            if (d.scope === 'employee') {
                              targeted = allEmps.filter(e => String(e.id) === String(d.targetEmployeeId));
                            } else if (d.scope === 'branch') {
                              const bId = String(d.targetBranchId);
                              targeted = allEmps.filter(e => String(e.branchId) === bId || (e.branchesDetails && e.branchesDetails.some(bd => String(bd.branchId) === bId)));
                            } else if (d.scope === 'job') {
                              const jTitle = String(d.targetJobTitle || '').trim().toLowerCase();
                              targeted = allEmps.filter(e => String(e.jobTitle || '').trim().toLowerCase() === jTitle);
                            }

                            const uniqueConfirmedIds = new Set(newConfirmations.map(c => String(c.employeeId)));
                            const allRead = targeted.length > 0 && targeted.every(e => uniqueConfirmedIds.has(String(e.id)));

                            return {
                              ...d,
                              readConfirmations: newConfirmations,
                              status: allRead ? 'archived' : 'active',
                              archivedAt: allRead ? new Date().toISOString() : null
                            };
                          }
                          return d;
                        });
                        updatedState = { ...updatedState, adminDirectives: updatedAdminDirs };
                      }

                      if (setState) setState(updatedState);
                      if (saveState) await saveState(updatedState);

                      // Check if there are more unconfirmed directives in queue
                      if (pendingDirectivesQueue.length > 0) {
                        setPendingDirectiveModal(pendingDirectivesQueue[0]);
                        setPendingDirectivesQueue(pendingDirectivesQueue.slice(1));
                      } else {
                        setPendingDirectiveModal(null);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '13px',
                      borderRadius: '12px',
                      fontSize: '15px',
                      fontWeight: 900,
                      background: 'linear-gradient(135deg, #059669, #10b981)',
                      border: 'none',
                      color: '#fff',
                      boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                      cursor: 'pointer'
                    }}
                  >
                    ✅ قرأت وفهمت التعليمات وأوافق عليها
                  </button>
                </div>
              ) : (
                <>
                  {/* ── Branch Selection Card for Multi-Branch Employees on General Kiosk Link ── */}
                  {showBranchSelector && (
                    <div
                      className="kiosk-branch-selector-card"
                      style={{
                        width: '100%',
                        marginBottom: '18px',
                        animation: 'fadeIn 0.3s ease-out'
                      }}
                    >
                      {activeShift ? (
                        <div
                          style={{
                            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                            border: '1.5px solid #93c5fd',
                            borderRadius: '16px',
                            padding: '12px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '22px' }}>🏢</span>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e40af' }}>
                                الوردية الحالية نشطة ومسجلة في:
                              </div>
                              <div style={{ fontSize: '15px', fontWeight: 900, color: '#1d4ed8' }}>
                                {(state?.branches || []).find(b => String(b.id) === String(activeShift.branchId))?.name || activeShift.branchName || 'الفرع المحدد'}
                              </div>
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              background: '#bfdbfe',
                              color: '#1e3a8a',
                              padding: '4px 10px',
                              borderRadius: '999px'
                            }}
                          >
                            وردية قيد العمل ⏱️
                          </span>
                        </div>
                      ) : (
                        <div
                          style={{
                            background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                            border: '2px solid #10b981',
                            borderRadius: '18px',
                            padding: '16px 18px',
                            boxShadow: '0 6px 20px rgba(16, 185, 129, 0.12)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '22px' }}>🏢</span>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#065f46' }}>
                                  اختر الفرع المراد تسجيل الحضور والعمل به:
                                </div>
                                <div style={{ fontSize: '11.5px', color: '#047857' }}>
                                  حدد الفرع لبدء الوردية وتطبيق لائحة ومعدلات الأجر الخاصة به
                                </div>
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 800,
                                background: '#d1fae5',
                                color: '#047857',
                                padding: '3px 10px',
                                borderRadius: '999px',
                                border: '1px solid #a7f3d0'
                              }}
                            >
                              موظف متعدد الفروع ({assignedBranches.length} فروع معتمدة)
                            </span>
                          </div>

                          {/* Branch Selection Buttons Grid */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: assignedBranches.length <= 3 ? `repeat(${assignedBranches.length}, 1fr)` : 'repeat(auto-fit, minmax(140px, 1fr))',
                              gap: '10px'
                            }}
                          >
                            {assignedBranches.map((b) => {
                              const isSelected = String(selectedBranchId) === String(b.id);
                              const isPrimary = matchedEmp && (
                                String(matchedEmp.branchId) === String(b.id) ||
                                String(matchedEmp.branchCode || '').trim() === String(b.id).trim() ||
                                String(matchedEmp.branchId || '').replace(/^branch_/, '') === String(b.id).replace(/^branch_/, '')
                              );

                              return (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() => setSelectedBranchId(b.id)}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '12px 14px',
                                    borderRadius: '14px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    background: isSelected ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : '#ffffff',
                                    color: isSelected ? '#ffffff' : '#1e293b',
                                    border: isSelected ? '2.5px solid #047857' : '1.5px solid #cbd5e1',
                                    boxShadow: isSelected ? '0 6px 16px rgba(16, 185, 129, 0.3)' : '0 2px 5px rgba(0,0,0,0.04)',
                                    transform: isSelected ? 'translateY(-2px)' : 'none'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '17px' }}>{isSelected ? '✅' : '🏢'}</span>
                                    <span style={{ fontSize: '14px', fontWeight: 800 }}>{b.name}</span>
                                  </div>
                                  <span
                                    style={{
                                      fontSize: '10px',
                                      fontWeight: 800,
                                      padding: '2px 8px',
                                      borderRadius: '999px',
                                      background: isSelected ? 'rgba(255, 255, 255, 0.25)' : '#e0f2fe',
                                      color: isSelected ? '#ffffff' : '#0369a1',
                                      border: isSelected ? '1px solid rgba(255,255,255,0.4)' : '1px solid #bae6fd'
                                    }}
                                  >
                                    {isPrimary ? '⭐ الفرع الأساسي' : '🏢 فرع معتمد'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions Grid */}
                  <div className="kiosk-action-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem', width: '100%' }}>
                  <div 
                    className={`kiosk-action-card start ${activeShift ? 'disabled' : ''}`} 
                    onClick={() => handleActionClick('shift_start')} 
                    style={{ opacity: activeShift ? 0.5 : 1, pointerEvents: activeShift ? 'none' : 'auto', background: '#fff', border: '2px solid #e2e8f0', borderRadius: '20px', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', cursor: 'pointer' }}
                  >
                    <div className="kiosk-action-icon" style={{ fontSize: '2.5rem' }}>🟢</div>
                    <div className="kiosk-action-title" style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#1e293b' }}>تسجيل حضور</div>
                    <div className="kiosk-action-sub" style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>بدء وردية جديدة</div>
                  </div>
                  
                  <div 
                    className={`kiosk-action-card end ${!activeShift ? 'disabled' : ''}`} 
                    onClick={() => handleActionClick('shift_end')} 
                    style={{ opacity: !activeShift ? 0.5 : 1, pointerEvents: !activeShift ? 'none' : 'auto', background: '#fff', border: '2px solid #e2e8f0', borderRadius: '20px', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', cursor: 'pointer' }}
                  >
                    <div className="kiosk-action-icon" style={{ fontSize: '2.5rem' }}>🔴</div>
                    <div className="kiosk-action-title" style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#1e293b' }}>تسجيل انصراف</div>
                    <div className="kiosk-action-sub" style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>إنهاء الوردية الحالية</div>
                  </div>

                  <div 
                    className={`kiosk-action-card break-out ${(!activeShift || activeShift.isPaused) ? 'disabled' : ''}`} 
                    onClick={() => handleActionClick('break_start')} 
                    style={{ opacity: (!activeShift || activeShift.isPaused) ? 0.5 : 1, pointerEvents: (!activeShift || activeShift.isPaused) ? 'none' : 'auto', background: '#fff', border: '2px solid #e2e8f0', borderRadius: '20px', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', cursor: 'pointer' }}
                  >
                    <div className="kiosk-action-icon" style={{ fontSize: '2.5rem' }}>☕</div>
                    <div className="kiosk-action-title" style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#1e293b' }}>بدء بريك</div>
                    <div className="kiosk-action-sub" style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>فترة استراحة</div>
                  </div>

                  <div 
                    className={`kiosk-action-card break-in ${(!activeShift || !activeShift.isPaused) ? 'disabled' : ''}`} 
                    onClick={() => handleActionClick('break_end')} 
                    style={{ opacity: (!activeShift || !activeShift.isPaused) ? 0.5 : 1, pointerEvents: (!activeShift || !activeShift.isPaused) ? 'none' : 'auto', background: '#fff', border: '2px solid #e2e8f0', borderRadius: '20px', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', cursor: 'pointer' }}
                  >
                    <div className="kiosk-action-icon" style={{ fontSize: '2.5rem' }}>▶️</div>
                    <div className="kiosk-action-title" style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Cairo, sans-serif', color: '#1e293b' }}>عودة من البريك</div>
                    <div className="kiosk-action-sub" style={{ fontSize: '0.9rem', color: '#64748b', textAlign: 'center' }}>استكمال الوردية</div>
                  </div>
                </div>
              </>
            )}
            </div>
          )}
        </div>
      </div>

      {activeAction && (
        <FaceVerificationOverlay 
          employee={matchedEmp}
          actionType={activeAction}
          onVerifySuccess={onVerifySuccess}
          onVerifyFailed={onVerifyFailed}
          onCancel={() => setActiveAction(null)}
          biometricType={matchedEmp?.preferred_biometric || orgSettings?.biometricType || 'face'}
        />
      )}

      {/* ── Blocked / Suspended / Resigned Employee Notification Modal ── */}
      {blockedStatusModal && (
        <div className="modal-backdrop" style={{ zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            className="modal-content card"
            style={{
              maxWidth: '520px',
              width: '94%',
              padding: '28px',
              borderRadius: '24px',
              border: `2px solid ${blockedStatusModal.type === 'resigned' ? '#450a0a' : '#ef4444'}`,
              background: '#ffffff',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              textAlign: 'center',
              fontFamily: "'Tajawal', sans-serif"
            }}
          >
            {/* Warning Icon Badge */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: blockedStatusModal.type === 'resigned' ? '#fee2e2' : '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              margin: '0 auto 16px auto',
              boxShadow: '0 8px 16px rgba(220, 38, 38, 0.15)'
            }}>
              {blockedStatusModal.type === 'resigned' ? '🚫' : '⛔'}
            </div>

            {/* Title */}
            <h3 style={{ margin: '0 0 6px 0', fontFamily: 'Cairo', fontSize: '20px', fontWeight: 800, color: '#991b1b' }}>
              عذراً، لا يمكن تسجيل الدخول أو الحضور
            </h3>
            <span style={{
              display: 'inline-block',
              background: blockedStatusModal.type === 'resigned' ? '#450a0a' : '#fee2e2',
              color: blockedStatusModal.type === 'resigned' ? '#ffffff' : '#b91c1c',
              fontSize: '12px',
              fontWeight: 800,
              padding: '3px 12px',
              borderRadius: '20px',
              marginBottom: '18px'
            }}>
              {blockedStatusModal.type === 'resigned' ? '⚠️ الموظف منهي خدمته / استقالة مسجلة' : '⏸️ تم إيقاف البصمة مؤقتاً'}
            </span>

            {/* Employee Card */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'right' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#e2e8f0', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 800, flexShrink: 0 }}>
                {blockedStatusModal.emp?.photoUrl ? (
                  <img src={blockedStatusModal.emp.photoUrl} alt={blockedStatusModal.emp.name} style={{ width: '100%', height: '100%', borderRadius: '12px', objectFit: 'cover' }} />
                ) : (
                  blockedStatusModal.emp?.name?.slice(0, 1) || '👤'
                )}
              </div>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '15px', color: '#1e293b', display: 'block' }}>{blockedStatusModal.emp?.name}</strong>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  كود الموظف: <strong style={{ fontFamily: 'monospace' }}>{blockedStatusModal.emp?.code}</strong> · {blockedStatusModal.emp?.jobTitle || 'موظف'}
                </span>
              </div>
            </div>

            {/* Reason Box */}
            <div style={{ background: '#fff5f5', border: '1.5px dashed #fca5a5', borderRadius: '12px', padding: '14px', marginBottom: '18px', textAlign: 'right' }}>
              <div style={{ fontWeight: 800, color: '#991b1b', fontSize: '13px', marginBottom: '6px' }}>
                📌 سبب منع الدخول:
              </div>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#7f1d1d', fontWeight: 600, lineHeight: '1.6' }}>
                {blockedStatusModal.reason}
              </p>
              {blockedStatusModal.date && (
                <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '6px' }}>
                  تاريخ تسجيل الإجراء: {new Date(blockedStatusModal.date).toLocaleDateString('ar-EG')}
                </span>
              )}
            </div>

            <p style={{ margin: '0 0 18px 0', fontSize: '12.5px', color: '#64748b' }}>
              * يرجى مراجعة إدارة الموارد البشرية أو الإدارة العليا للاستفسار أو إعادة تفعيل البصمة.
            </p>

            {/* Close Button */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setBlockedStatusModal(null)}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '14px',
                background: '#dc2626',
                border: 'none'
              }}
            >
              حسناً، فهمت ذلك
            </button>
          </div>
        </div>
      )}

      {/* ── Modern In-System Kiosk Notification Modal ── */}
      {kioskAlertModal && kioskAlertModal.isOpen && (
        <div
          className="kiosk-modal-backdrop fade-in"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px',
            fontFamily: "'Tajawal', sans-serif"
          }}
        >
          <div
            className="kiosk-modal-content"
            style={{
              maxWidth: '520px',
              width: '100%',
              textAlign: 'center',
              padding: '32px 26px',
              borderRadius: '24px',
              border: `2px solid ${kioskAlertModal.type === 'error' ? 'rgba(239, 68, 68, 0.6)' : kioskAlertModal.type === 'warning' ? 'rgba(245, 158, 11, 0.6)' : 'rgba(16, 185, 129, 0.6)'}`,
              boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 35px ${kioskAlertModal.type === 'error' ? 'rgba(239, 68, 68, 0.25)' : kioskAlertModal.type === 'warning' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`,
              background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.98), rgba(15, 23, 42, 0.99))',
              color: '#ffffff',
              position: 'relative'
            }}
          >
            {/* Animated Status Icon */}
            <div
              style={{
                width: '76px',
                height: '76px',
                borderRadius: '50%',
                margin: '0 auto 16px',
                background: kioskAlertModal.type === 'error' ? 'rgba(239, 68, 68, 0.18)' : kioskAlertModal.type === 'warning' ? 'rgba(245, 158, 11, 0.18)' : 'rgba(16, 185, 129, 0.18)',
                border: `2px solid ${kioskAlertModal.type === 'error' ? '#ef4444' : kioskAlertModal.type === 'warning' ? '#f59e0b' : '#10b981'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '36px',
                boxShadow: `0 0 24px ${kioskAlertModal.type === 'error' ? 'rgba(239, 68, 68, 0.4)' : kioskAlertModal.type === 'warning' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`
              }}
            >
              {kioskAlertModal.type === 'error' ? '❌' : kioskAlertModal.type === 'warning' ? '⚠️' : '📸'}
            </div>

            {/* Title */}
            <h2
              style={{
                fontSize: '1.4rem',
                fontFamily: 'Cairo',
                fontWeight: 800,
                margin: '0 0 8px',
                color: kioskAlertModal.type === 'error' ? '#fca5a5' : kioskAlertModal.type === 'warning' ? '#fde047' : '#34d399'
              }}
            >
              {kioskAlertModal.title}
            </h2>

            {kioskAlertModal.subtitle && (
              <p style={{ color: '#cbd5e1', fontSize: '0.96rem', fontWeight: 600, margin: '0 0 16px' }}>
                {kioskAlertModal.subtitle}
              </p>
            )}

            {/* Details Box */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '16px',
                textAlign: 'right',
                fontSize: '0.92rem',
                lineHeight: '1.7',
                marginBottom: '20px'
              }}
            >
              {kioskAlertModal.timeStr && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px', marginBottom: '8px' }}>
                  <span style={{ color: '#94a3b8' }}>وقت التوثيق المحفوظ:</span>
                  <strong style={{ color: '#38bdf8' }}>{kioskAlertModal.timeStr} بتاريخ {kioskAlertModal.dateStr}</strong>
                </div>
              )}

              {kioskAlertModal.driveSaved && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px', marginBottom: '8px' }}>
                  <span style={{ color: '#94a3b8' }}>حفظ الصورة السحابي:</span>
                  <span style={{ color: '#34d399', fontWeight: 'bold' }}>☁️ تم الحفظ بمجلد Google Drive</span>
                </div>
              )}

              <div style={{ color: kioskAlertModal.type === 'error' ? '#fca5a5' : '#fcd34d', fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ flexShrink: 0 }}>{kioskAlertModal.type === 'error' ? '📌' : 'ℹ️'}</span>
                <span>{kioskAlertModal.note || kioskAlertModal.message}</span>
              </div>
            </div>

            {/* Confirmation Button with Live Countdown */}
            <button
              type="button"
              onClick={kioskAlertModal.onClose}
              style={{
                width: '100%',
                padding: '13px',
                fontSize: '1rem',
                fontFamily: 'Cairo',
                fontWeight: 800,
                borderRadius: '12px',
                border: 'none',
                background: kioskAlertModal.type === 'error'
                  ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                  : kioskAlertModal.type === 'warning'
                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
                transition: 'transform 0.15s ease'
              }}
            >
              حسناً {kioskAlertModal.countdown !== undefined && `(${kioskAlertModal.countdown} ثانية)`}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
