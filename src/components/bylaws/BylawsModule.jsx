import React, { useState, useMemo, useEffect } from 'react';
import LatePenaltyPolicyModule from './LatePenaltyPolicyModule';
import DisciplinaryPenaltiesTab from './DisciplinaryPenaltiesTab';
import { computeLatenessFinancialAmount, isApprovedPermissionForDate } from '../../utils/latePenaltyEngine';
import {
  DEFAULT_PHARMACY_BYLAWS_SECTIONS,
  parseBylawsIntoSections,
  sectionsToBylawsText,
  getBylawsSectionsFromState
} from '../../utils/bylawsDefaults';
import { useUI } from '../../context/UIContext';

export default function BylawsModule({
  state,
  setState,
  saveState,
  showToast,
  userRole = 'admin',
  activeSubTab = 'disciplinary_penalties',
  setActiveSubTab,
  currentEmpId = null,
  currentBranchId = null,
  filterFn = null,
  monthPicker = null,
  filterMode = 'all',
  customFrom = '',
  customTo = '',
  executeWithOwnerGuard
}) {
  const { showConfirm } = useUI();
  const [isMobileScreen, setIsMobileScreen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));
  useEffect(() => {
    const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [activeTab, setActiveTab] = useState(activeSubTab || 'disciplinary_penalties'); // 'disciplinary_penalties' | 'text' | 'records' | 'late_penalties'

  useEffect(() => {
    if (activeSubTab) {
      setActiveTab(activeSubTab);
    }
  }, [activeSubTab]);
  const isManagerOrAdmin = userRole === 'admin' || userRole === 'owner' || userRole === 'branch';
  const isAdmin = userRole === 'admin' || userRole === 'owner';

  // State for official bylaws structured sections & raw text
  const [bylawsSections, setBylawsSections] = useState(() => getBylawsSectionsFromState(state));
  const [bylawsViewMode, setBylawsViewMode] = useState('structured'); // 'structured' | 'raw_text'
  const [bylawsRawText, setBylawsRawText] = useState(() => {
    if (state.bylawsText && typeof state.bylawsText === 'string' && state.bylawsText.trim().length > 0) {
      return state.bylawsText;
    }
    return sectionsToBylawsText(getBylawsSectionsFromState(state));
  });

  // Keep synced if state changes from remote
  useEffect(() => {
    if (state.bylawsSections && Array.isArray(state.bylawsSections) && state.bylawsSections.length > 0) {
      setBylawsSections(state.bylawsSections);
      setBylawsRawText(sectionsToBylawsText(state.bylawsSections));
    } else if (state.bylawsText) {
      const parsed = parseBylawsIntoSections(state.bylawsText);
      setBylawsSections(parsed);
      setBylawsRawText(state.bylawsText);
    }
  }, [state.bylawsSections, state.bylawsText]);

  // Penalty Objection State
  const [objectionTargetReq, setObjectionTargetReq] = useState(null);
  const [objectionReason, setObjectionReason] = useState('');
  const [adminRejectReplyReq, setAdminRejectReplyReq] = useState(null);
  const [adminRejectReplyText, setAdminRejectReplyText] = useState('');

  // ── Clause / Section Management Handlers ──
  const handleAddBylawSection = () => {
    const nextNum = bylawsSections.length;
    const newSection = {
      id: `bylaw_${Date.now()}`,
      title: `البند رقم (${nextNum}): بند وسياسة جديدة`,
      category: 'general',
      points: ['اكتب نص الضابط أو السياسة التنظيمية هنا...']
    };
    const updated = [...bylawsSections, newSection];
    setBylawsSections(updated);
    setBylawsRawText(sectionsToBylawsText(updated));
  };

  const handleUpdateBylawSection = (secId, field, val) => {
    const updated = bylawsSections.map((s) => (s.id === secId ? { ...s, [field]: val } : s));
    setBylawsSections(updated);
    setBylawsRawText(sectionsToBylawsText(updated));
  };

  const handleMoveBylawSection = (idx, direction) => {
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === bylawsSections.length - 1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const updated = [...bylawsSections];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setBylawsSections(updated);
    setBylawsRawText(sectionsToBylawsText(updated));
  };

  const handleDeleteBylawSection = async (secId) => {
    const isConfirmed = await showConfirm({
      title: 'حذف بند من لائحة العمل',
      message: 'هل أنت متأكد من حذف هذا البند من لائحة العمل؟',
      confirmText: 'تأكيد الحذف',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '📜'
    });
    if (isConfirmed) {
      const updated = bylawsSections.filter((s) => s.id !== secId);
      setBylawsSections(updated);
      setBylawsRawText(sectionsToBylawsText(updated));
    }
  };

  const handleAddPointToSection = (secId, initialText = '') => {
    const updated = bylawsSections.map((s) => {
      if (s.id === secId) {
        return {
          ...s,
          points: [...(s.points || []), initialText || 'ضابط أو تعليمات جديدة...']
        };
      }
      return s;
    });
    setBylawsSections(updated);
    setBylawsRawText(sectionsToBylawsText(updated));
  };

  const handleUpdatePoint = (secId, pIdx, val) => {
    const updated = bylawsSections.map((s) => {
      if (s.id === secId) {
        const newPoints = [...(s.points || [])];
        newPoints[pIdx] = val;
        return { ...s, points: newPoints };
      }
      return s;
    });
    setBylawsSections(updated);
    setBylawsRawText(sectionsToBylawsText(updated));
  };

  const handleTogglePointMarker = (secId, pIdx) => {
    const updated = bylawsSections.map((s) => {
      if (s.id === secId) {
        const newPoints = [...(s.points || [])];
        let p = String(newPoints[pIdx] || '').trim();
        if (p.startsWith('❌')) {
          p = '✔️ ' + p.replace(/^❌\s*/, '');
        } else if (p.startsWith('✔️')) {
          p = p.replace(/^✔️\s*/, '');
        } else {
          p = '❌ ' + p.replace(/^▪\s*/, '').replace(/^\-\s*/, '');
        }
        newPoints[pIdx] = p;
        return { ...s, points: newPoints };
      }
      return s;
    });
    setBylawsSections(updated);
    setBylawsRawText(sectionsToBylawsText(updated));
  };

  const handleDeletePoint = (secId, pIdx) => {
    const updated = bylawsSections.map((s) => {
      if (s.id === secId) {
        const newPoints = (s.points || []).filter((_, idx) => idx !== pIdx);
        return { ...s, points: newPoints };
      }
      return s;
    });
    setBylawsSections(updated);
    setBylawsRawText(sectionsToBylawsText(updated));
  };

  const handleRawTextChange = (text) => {
    setBylawsRawText(text);
    const parsed = parseBylawsIntoSections(text);
    setBylawsSections(parsed);
  };

  const handleSaveBylawsText = async () => {
    const performSaveText = async () => {
      const formattedText = sectionsToBylawsText(bylawsSections);
      const updatedState = {
        ...state,
        bylawsSections: bylawsSections,
        bylawsText: formattedText,
        bylawsUpdatedAt: new Date().toISOString()
      };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      showToast?.('✅ تم حفظ وتحديث بنود وسياسات لائحة العمل الرسمية بنجاح');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditSystemPermissions',
        actionTitle: 'حفظ وتحديث بنود لائحة العمل الرسمية',
        actionDetails: `عدد البنود المعتمدة: ${bylawsSections.length} بند`,
        onExecute: performSaveText
      });
    } else {
      await performSaveText();
    }
  };

  const handleResetDefaultBylawsText = async () => {
    const isConfirmed = await showConfirm({
      title: 'استعادة اللائحة النموذجية المعتمدة',
      message: 'هل ترغب في استعادة بنود اللائحة النموذجية المعتمدة للصيدلية (14 بنداً شاملاً لكافة السياسات)؟\nسيتم استبدال النصوص الحالية بالنصوص النموذجية.',
      confirmText: 'استعادة النموذج القياسي',
      cancelText: 'إلغاء وتراجع',
      type: 'warning',
      icon: '📋'
    });
    if (!isConfirmed) return;

    const performResetText = async () => {
      const defaultSections = DEFAULT_PHARMACY_BYLAWS_SECTIONS;
      const defaultText = sectionsToBylawsText(defaultSections);
      setBylawsSections(defaultSections);
      setBylawsRawText(defaultText);
      const updatedState = {
        ...state,
        bylawsSections: defaultSections,
        bylawsText: defaultText,
        bylawsUpdatedAt: new Date().toISOString()
      };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);
      showToast?.('🔄 تم استعادة بنود اللائحة النموذجية المعتمدة للصيدلية بنجاح');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockEditSystemPermissions',
        actionTitle: 'استعادة بنود اللائحة النموذجية',
        actionDetails: 'إعادة ضبط اللائحة للنموذج المعتمد',
        onExecute: performResetText
      });
    } else {
      await performResetText();
    }
  };

  const handleSubmitObjection = (e) => {
    e.preventDefault();
    if (!objectionTargetReq || !objectionReason.trim()) {
      showToast?.('يرجى كتابة أسباب ومبررات الاعتراض');
      return;
    }

    const penId = objectionTargetReq.id;
    const reasonText = objectionReason.trim();
    const objData = {
      status: 'pending',
      reason: reasonText,
      submittedAt: new Date().toISOString()
    };

    let updatedRequests = [...(state.requests || [])];
    let updatedLateIncidents = [...(state.lateIncidents || [])];
    let updatedAdjustments = [...(state.adjustments || [])];

    if (objectionTargetReq.sourceType === 'late_incident') {
      updatedLateIncidents = updatedLateIncidents.map((inc) => {
        if (String(inc.id) === String(penId)) {
          return {
            ...inc,
            objection: objData,
            status: 'objection_pending'
          };
        }
        return inc;
      });
    } else if (objectionTargetReq.sourceType === 'adjustment') {
      updatedAdjustments = updatedAdjustments.map((a) => {
        if (String(a.id) === String(penId)) {
          return {
            ...a,
            objection: objData
          };
        }
        return a;
      });
    } else {
      updatedRequests = updatedRequests.map((r) => {
        if (String(r.id) === String(penId)) {
          return {
            ...r,
            objection: objData
          };
        }
        return r;
      });
    }

    // Create a formal request entry for Higher Management
    const objReq = {
      id: `obj_req_${penId}_${Date.now()}`,
      penaltyId: penId,
      sourceType: objectionTargetReq.sourceType || 'late_incident',
      type: 'penalty_objection',
      typeLabel: 'تظلم على جزاء لائحى',
      employeeId: objectionTargetReq.employeeId,
      employeeCode: objectionTargetReq.employeeCode,
      employeeName: objectionTargetReq.employeeName,
      branchId: objectionTargetReq.branchId,
      branchName: objectionTargetReq.branchName,
      date: objectionTargetReq.date || new Date().toISOString().slice(0, 10),
      reason: reasonText,
      details: `تظلم على: ${objectionTargetReq.ruleTitle || objectionTargetReq.reason || 'جزاء تأديبي'} (${objectionTargetReq.penaltyAmount || objectionTargetReq.amount || 0} ج.م / ${objectionTargetReq.deductionMinutes || 0} دقيقة) — مبررات الموظف: ${reasonText}`,
      penaltyAmount: objectionTargetReq.penaltyAmount || objectionTargetReq.amount || 0,
      deductionMinutes: objectionTargetReq.deductionMinutes || 0,
      violationTitle: objectionTargetReq.ruleTitle || objectionTargetReq.reason || 'جزاء تأديبي',
      status: 'pending',
      adminApproved: false,
      createdAt: new Date().toISOString()
    };

    updatedRequests = [objReq, ...updatedRequests.filter(r => r.penaltyId !== penId || r.type !== 'penalty_objection')];

    // Create admin notification
    const objNotif = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'bylaws',
      targetRole: 'admin',
      requestId: objReq.id,
      employeeId: objectionTargetReq.employeeId,
      title: `✋ تظلم جديد على جزاء (${objectionTargetReq.employeeName || 'موظف'})`,
      message: `تظلم على: ${objectionTargetReq.ruleTitle || objectionTargetReq.reason || 'جزاء تأديبي'} — السبب: ${reasonText}`,
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      read: false
    };

    const updatedNotifications = [objNotif, ...(state.notifications || [])];

    const updatedState = {
      ...state,
      requests: updatedRequests,
      lateIncidents: updatedLateIncidents,
      adjustments: updatedAdjustments,
      notifications: updatedNotifications
    };

    // 0ms instant optimistic UI response
    if (setState) setState(updatedState);
    setObjectionTargetReq(null);
    setObjectionReason('');
    showToast?.('✅ تم إرسال اعتراضك إلى الإدارة العليا فوراً وجاري مراجعته');

    // Non-blocking background sync
    if (saveState) {
      saveState(updatedState).catch(err => console.error('Background save error on objection submit:', err));
    }
  };

  const handleAdminApproveObjection = async (reqId) => {
    const performApproveObj = async () => {
      let empId = null;
      let ruleTitle = '';
      const cleanId = String(reqId).replace(/^(req_|obj_req_|obj_inc_|obj_adj_)/, '');
      const updatedRequests = (state.requests || []).map((r) => {
        const rIdStr = String(r.id);
        const isTarget =
          rIdStr === String(reqId) ||
          rIdStr === cleanId ||
          rIdStr === `req_${cleanId}` ||
          r.penaltyId === reqId ||
          r.penaltyId === cleanId;

        if (isTarget) {
          empId = r.employeeId;
          ruleTitle = r.ruleTitle || r.reason;
          return {
            ...r,
            status: 'cancelled',
            isCancelled: true,
            amount: 0,
            deductionMinutes: 0,
            cancelledAt: new Date().toISOString(),
            cancelledBy: 'الإدارة العليا',
            cancellationReason: 'تم قبول تظلم الموظف وإلغاء الجزاء التأديبي',
            objection: {
              ...(r.objection || {}),
              status: 'approved',
              resolvedAt: new Date().toISOString()
            }
          };
        }
        return r;
      });

      const updatedLateIncidents = (state.lateIncidents || []).map((inc) => {
        const incIdStr = String(inc.id);
        const isTarget =
          incIdStr === String(reqId) ||
          incIdStr === cleanId ||
          incIdStr === `late_inc_${cleanId}`;

        if (isTarget) {
          if (!empId) empId = inc.employeeId;
          return {
            ...inc,
            status: 'cancelled',
            actionType: 'grace',
            actionLabel: 'سماح (تم قبول التظلم وإلغاء الخصم)',
            deductionMinutes: 0,
            deductionHours: 0,
            penaltyAmount: 0,
            isCancelled: true,
            cancellationReason: 'تم قبول تظلم الموظف وإلغاء الجزاء التأديبي',
            objection: {
              ...(inc.objection || {}),
              status: 'approved',
              resolvedAt: new Date().toISOString()
            }
          };
        }
        return inc;
      });

      // Automatically remove any corresponding deduction from adjustments
      const updatedAdjustments = (state.adjustments || []).filter((a) => {
        const aIdStr = String(a.id);
        if (
          aIdStr === String(reqId) ||
          aIdStr === cleanId ||
          aIdStr === `adj_${reqId}` ||
          aIdStr === `adj_${cleanId}` ||
          aIdStr === `adj_penalty_${reqId}` ||
          aIdStr === `adj_disc_${reqId}` ||
          aIdStr === `adj_disc_${cleanId}` ||
          a.requestId === reqId ||
          a.requestId === cleanId
        ) return false;
        if (empId && String(a.employeeId) === String(empId) && (a.type === 'penalty' || a.type === 'deduction') && (a.reason === ruleTitle || a.details === ruleTitle)) return false;
        return true;
      });

      const updatedState = {
        ...state,
        requests: updatedRequests,
        lateIncidents: updatedLateIncidents,
        adjustments: updatedAdjustments
      };
      if (setState) setState(updatedState);
      if (saveState) await saveState(updatedState);

      showToast?.('✅ تم قبول الاعتراض وإلغاء الخصم والجزاء اللائحي تلقائياً');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockDirectBonusDeduction',
        actionTitle: 'قبول اعتراض وإلغاء خصم جزاء لائحي',
        actionDetails: `معرف الطلب: ${reqId}`,
        onExecute: performApproveObj
      });
    } else {
      await performApproveObj();
    }
  };

  const handleAdminRejectObjection = async (reqId, reply = '') => {
    const cleanId = String(reqId).replace(/^(req_|obj_req_|obj_inc_|obj_adj_)/, '');
    const updatedRequests = (state.requests || []).map((r) => {
      const rIdStr = String(r.id);
      if (rIdStr === String(reqId) || rIdStr === cleanId || rIdStr === `req_${cleanId}` || r.penaltyId === reqId || r.penaltyId === cleanId) {
        return {
          ...r,
          objection: {
            ...(r.objection || {}),
            status: 'rejected',
            adminReply: reply || 'تمت مراجعة ودراسة الاعتراض وتثبيت الجزاء المالي وفق اللائحة',
            resolvedAt: new Date().toISOString()
          }
        };
      }
      return r;
    });

    const updatedLateIncidents = (state.lateIncidents || []).map((inc) => {
      const incIdStr = String(inc.id);
      if (incIdStr === String(reqId) || incIdStr === cleanId || incIdStr === `late_inc_${cleanId}`) {
        return {
          ...inc,
          status: 'approved',
          objection: {
            ...(inc.objection || {}),
            status: 'rejected',
            adminReply: reply || 'تمت مراجعة ودراسة الاعتراض وتثبيت الجزاء المالي وفق اللائحة',
            resolvedAt: new Date().toISOString()
          }
        };
      }
      return inc;
    });

    const updatedState = { ...state, requests: updatedRequests, lateIncidents: updatedLateIncidents };
    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    setAdminRejectReplyReq(null);
    setAdminRejectReplyText('');
    showToast?.('تم تسجيل قرار الرفض على الاعتراض');
  };

  const [recordsSearch, setRecordsSearch] = useState('');
  const [recordsBranch, setRecordsBranch] = useState(currentBranchId ? String(currentBranchId) : '');
  const [recordsStatus, setRecordsStatus] = useState('all');
  const [recordsPeriodMode, setRecordsPeriodMode] = useState('all');
  const [recordsCustomFrom, setRecordsCustomFrom] = useState(customFrom || '');
  const [recordsCustomTo, setRecordsCustomTo] = useState(customTo || '');

  const employees = state.employees || [];
  const branches = state.branches || [];

  const allPenalties = useMemo(() => {
    const list = [];
    const seenReqIds = new Set();
    const seenLateKeys = new Set();

    (state.requests || []).forEach((r) => {
      if (
        r.type === 'penalty' ||
        r.type === 'early_exit' ||
        r.subType === 'lateness' ||
        (r.type === 'adjustment' && r.subType === 'penalty') ||
        r.type === 'disciplinary_penalty' ||
        r.subType === 'disciplinary_penalty' ||
        r.ruleTitle
      ) {
        const idStr = String(r.id);
        const cleanId = idStr.replace(/^req_/, '');
        seenReqIds.add(idStr);
        seenReqIds.add(cleanId);
        seenReqIds.add(`req_${cleanId}`);
        seenReqIds.add(`late_inc_${cleanId.replace(/^late_inc_/, '')}`);
        seenReqIds.add(`req_late_inc_${cleanId.replace(/^late_inc_/, '')}`);

        const isLateReq = r.subType === 'lateness' || r.type === 'late_penalty' || idStr.startsWith('req_late_inc_');
        if (isLateReq && (isApprovedPermissionForDate(r.employeeId, r.date, state) || r.status === 'approved_permission_exempt')) {
          return;
        }
        if (isLateReq && r.employeeId && r.date) {
          seenLateKeys.add(`${r.employeeId}_${r.date}`);
        }

        const emp = employees.find((e) => String(e.id) === String(r.employeeId));
        const bObj = branches.find((b) => String(b.id) === String(r.branchId || emp?.branchId));
        
        let amount = parseFloat(r.amount) || 0;
        if (!amount && (r.impactType || r.impactVal)) {
          if (r.impactType === 'deduction_days') {
            const salary = emp ? parseFloat(emp.salary) || 0 : 0;
            const workHours = emp ? parseFloat(emp.workHoursPerDay) || 8 : 8;
            const workDays = emp ? parseFloat(emp.workDaysPerMonth) || 26 : 26;
            const dailyRate = workDays > 0 ? (salary * workHours) / workDays : (salary * workHours);
            amount = Math.round(dailyRate * (parseFloat(r.impactVal) || 1) * 100) / 100;
          } else if (r.impactType === 'fixed_amount') {
            amount = parseFloat(r.impactVal) || 0;
          }
        }

        // Check for approved objection in requests
        const isApprovedObjection =
          r.objection?.status === 'approved' ||
          r.isCancelled ||
          r.status === 'cancelled' ||
          (state.requests || []).some(
            (req) =>
              (req.type === 'penalty_objection' || req.type === 'objection') &&
              (req.status === 'approved' || req.adminApproved) &&
              (req.penaltyId === r.id || req.id === `obj_inc_${r.id}` || req.id === `obj_req_${r.id}` || (String(req.employeeId) === String(r.employeeId) && req.date === r.date))
          );

        const isPendingObjection =
          !isApprovedObjection &&
          (r.objection?.status === 'pending' ||
           r.status === 'objection_pending' ||
           (state.requests || []).some(
             (req) =>
               (req.type === 'penalty_objection' || req.type === 'objection') &&
               req.status === 'pending' &&
               (req.penaltyId === r.id || req.id === `obj_inc_${r.id}` || req.id === `obj_req_${r.id}` || (String(req.employeeId) === String(r.employeeId) && req.date === r.date))
           ));

        let effectiveStatus = r.status || (r.adminApproved ? 'approved' : 'pending');
        let effectiveObjection = r.objection ? { ...r.objection } : null;

        if (isApprovedObjection) {
          effectiveStatus = 'cancelled';
          amount = 0;
          effectiveObjection = { ...(effectiveObjection || {}), status: 'approved' };
        } else if (isPendingObjection) {
          effectiveObjection = { ...(effectiveObjection || {}), status: 'pending' };
        }

        list.push({
          id: r.id,
          employeeId: r.employeeId,
          employeeName: emp?.name || r.employeeName || 'موظف',
          employeeCode: emp?.code || r.employeeCode || '—',
          branchId: r.branchId || emp?.branchId,
          branchName: bObj?.name || 'الفرع الرئيسي',
          ruleTitle: r.ruleTitle || r.actionTitle || (r.subType === 'lateness' ? `تأخير عن الشيفت (${r.latenessMinutes || ''} د)` : r.reason) || 'مخالفة لائحية',
          category: r.categoryName || r.category || 'انضباط ولائحة',
          impactType: r.impactType || (r.impactVal ? 'deduction_days' : 'fixed_amount'),
          impactVal: r.impactVal || r.deductionDays || 0,
          amount: amount,
          date: r.date || (r.createdAt ? r.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
          createdAt: r.createdAt || new Date().toISOString(),
          reason: r.reason || r.ruleTitle || r.details || 'مخالفة لائحية',
          details: r.details || r.reason || 'مخالفة لائحية',
          status: effectiveStatus,
          adminApproved: r.adminApproved,
          objection: effectiveObjection,
          isCancelled: isApprovedObjection,
          sourceType: 'request'
        });
      }
    });

    (state.lateIncidents || []).forEach((inc) => {
      if (
        inc.status === 'cancelled' ||
        inc.isCancelled ||
        inc.objection?.status === 'approved' ||
        inc.status === 'approved_permission_exempt' ||
        inc.actionType === 'grace' ||
        isApprovedPermissionForDate(inc.employeeId, inc.date, state)
      ) return;
      const incIdStr = String(inc.id);
      const cleanIncId = incIdStr.replace(/^late_inc_/, '');
      if (
        seenReqIds.has(incIdStr) ||
        seenReqIds.has(cleanIncId) ||
        seenReqIds.has(`req_${incIdStr}`) ||
        seenReqIds.has(`req_late_inc_${cleanIncId}`) ||
        (inc.employeeId && inc.date && seenLateKeys.has(`${inc.employeeId}_${inc.date}`))
      ) {
        return;
      }
      seenReqIds.add(incIdStr);
      seenReqIds.add(`req_${incIdStr}`);
      if (inc.employeeId && inc.date) seenLateKeys.add(`${inc.employeeId}_${inc.date}`);

      const emp = employees.find((e) => String(e.id) === String(inc.employeeId));
      const bObj = branches.find((b) => String(b.id) === String(inc.branchId || emp?.branchId));
      const dayAmt = computeLatenessFinancialAmount(inc.deductionMinutes || 0, emp, inc.branchId);
      const incAmount = dayAmt > 0 ? dayAmt : (parseFloat(inc.penaltyAmount) || 0);

      const isApprovedObjection =
        inc.objection?.status === 'approved' ||
        inc.isCancelled ||
        inc.status === 'cancelled' ||
        (state.requests || []).some(
          (req) =>
            (req.type === 'penalty_objection' || req.type === 'objection') &&
            (req.status === 'approved' || req.adminApproved) &&
            (req.penaltyId === inc.id || req.id === `obj_inc_${inc.id}` || (String(req.employeeId) === String(inc.employeeId) && req.date === inc.date))
        );

      if (isApprovedObjection) return;

      list.push({
        id: inc.id,
        employeeId: inc.employeeId,
        employeeName: emp?.name || inc.employeeName || 'موظف',
        employeeCode: emp?.code || inc.employeeCode || '—',
        branchId: inc.branchId || emp?.branchId,
        branchName: inc.branchName || bObj?.name || 'الفرع الرئيسي',
        ruleTitle: `⏱️ تأخير عن الشيفت (${inc.lateMinutes || 0} دقيقة) - ${inc.tierName || 'اللائحة'}`,
        category: 'تأخيرات الحضور والورديات',
        impactType: 'deduction_minutes',
        impactVal: inc.deductionMinutes || 0,
        amount: incAmount,
        date: inc.date || (inc.createdAt ? inc.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
        createdAt: inc.createdAt || inc.date,
        reason: `حضور ${inc.actualPunchInTime || '—'} بدلاً من ${inc.scheduledStartTime || '—'} (تأخير ${inc.lateMinutes || 0} دقيقة)`,
        details: inc.actionLabel || `خصم ${inc.deductionMinutes || 0} دقيقة`,
        status: inc.status === 'overridden' ? 'overridden' : (inc.status || 'approved'),
        adminApproved: true,
        objection: inc.objection || null,
        sourceType: 'late_incident'
      });
    });

    (state.adjustments || []).forEach((a) => {
      const isLinkedToReq = Array.from(seenReqIds).some(
        (reqId) => a.id === `adj_pen_${reqId}` || a.id === `adj_disc_${reqId}` || a.id === reqId || a.id === `adj_${reqId}` || a.requestId === reqId
      );
      if (!isLinkedToReq && (a.type === 'deduction' || a.type === 'penalty')) {
        const emp = employees.find((e) => String(e.id) === String(a.employeeId));
        const bObj = branches.find((b) => String(b.id) === String(a.branchId || emp?.branchId));
        
        list.push({
          id: a.id,
          employeeId: a.employeeId,
          employeeName: emp?.name || a.employeeName || 'موظف',
          employeeCode: emp?.code || a.employeeCode || '—',
          branchId: a.branchId || emp?.branchId,
          branchName: bObj?.name || 'الفرع الرئيسي',
          ruleTitle: a.reason || a.description || 'خصم مالي مباشر',
          category: 'ماليات وخصومات',
          impactType: 'fixed_amount',
          impactVal: parseFloat(a.amount) || 0,
          amount: parseFloat(a.amount) || 0,
          date: a.date || (a.createdAt ? a.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10)),
          createdAt: a.createdAt || new Date().toISOString(),
          reason: a.reason || a.description || 'خصم مباشر',
          details: a.description || a.reason || 'خصم مباشر',
          status: 'approved',
          adminApproved: true,
          objection: null,
          sourceType: 'adjustment'
        });
      }
    });

    return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [state.requests, state.adjustments, employees, branches]);

  const filteredPenalties = useMemo(() => {
    const targetBranchStr = currentBranchId ? String(currentBranchId) : null;

    return allPenalties.filter((p) => {
      if (currentEmpId && String(p.employeeId) !== String(currentEmpId)) return false;

      if (targetBranchStr) {
        const emp = employees.find((e) => String(e.id) === String(p.employeeId));
        const isEmpInBranch = emp && (
          String(emp.branchId) === targetBranchStr ||
          (emp.branchesDetails && emp.branchesDetails.some((bd) => String(bd.branchId) === targetBranchStr))
        );
        const isDirectBranch = p.branchId && String(p.branchId) === targetBranchStr;
        if (!isEmpInBranch && !isDirectBranch) return false;
      } else if (recordsBranch && String(p.branchId) !== String(recordsBranch)) {
        return false;
      }

      if (recordsStatus !== 'all') {
        if (recordsStatus === 'objection') {
          if (!p.objection) return false;
        } else if (recordsStatus === 'approved') {
          if (p.status !== 'approved' && !p.adminApproved) return false;
        } else if (recordsStatus === 'pending') {
          if (p.status !== 'pending' && p.status !== 'pending_admin') return false;
        } else if (recordsStatus === 'rejected') {
          if (p.status !== 'rejected') return false;
        }
      }

      if (recordsSearch.trim()) {
        const q = recordsSearch.trim().toLowerCase();
        const matchName = (p.employeeName || '').toLowerCase().includes(q);
        const matchCode = (p.employeeCode || '').toLowerCase().includes(q);
        const matchBranch = (p.branchName || '').toLowerCase().includes(q);
        const matchRule = (p.ruleTitle || '').toLowerCase().includes(q);
        const matchReason = (p.reason || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchBranch && !matchRule && !matchReason) return false;
      }
      if (recordsPeriodMode === 'current') {
        if (filterFn) {
          if (!filterFn(p.date)) return false;
        } else if (monthPicker) {
          if (!p.date.startsWith(monthPicker)) return false;
        }
      } else if (recordsPeriodMode === 'custom') {
        if (recordsCustomFrom && p.date < recordsCustomFrom) return false;
        if (recordsCustomTo && p.date > recordsCustomTo) return false;
      }
      return true;
    });
  }, [allPenalties, currentEmpId, recordsBranch, recordsStatus, recordsSearch, recordsPeriodMode, recordsCustomFrom, recordsCustomTo, filterFn, monthPicker]);

  const totalFilteredDeduction = filteredPenalties
    .filter((p) => p.status === 'approved' || p.adminApproved)
    .reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);

  const pendingCount = filteredPenalties.filter((p) => p.status === 'pending' || p.status === 'pending_admin').length;
  const approvedCount = filteredPenalties.filter((p) => p.status === 'approved' || p.adminApproved).length;

  return (
    <div className="bylaws-card" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--text)' }}>
            📜 لائحة العمل والجزاءات التأديبية
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '14px' }}>
            نظام عداد تكرار المخالفات المستقل، سياسات العمل الرسمية، وسجل القرارات والخصومات
          </p>
        </div>

        {/* Interactive Tabs Switcher Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', background: 'var(--surface-muted)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === 'text' ? '#0f766e' : 'transparent',
              color: activeTab === 'text' ? '#ffffff' : 'var(--text)',
              boxShadow: activeTab === 'text' ? '0 2px 6px rgba(15,118,110,0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <span>📖</span> نصوص وسياسات اللائحة ({bylawsSections.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('disciplinary_penalties')}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === 'disciplinary_penalties' ? '#dc2626' : 'transparent',
              color: activeTab === 'disciplinary_penalties' ? '#ffffff' : 'var(--text)',
              boxShadow: activeTab === 'disciplinary_penalties' ? '0 2px 6px rgba(220,38,38,0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <span>⚖️</span> لائحة الجزاءات والمخالفات
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('records')}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: activeTab === 'records' ? '#2563eb' : 'transparent',
              color: activeTab === 'records' ? '#ffffff' : 'var(--text)',
              boxShadow: activeTab === 'records' ? '0 2px 6px rgba(37,99,235,0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <span>📋</span> سجل القرارات والخصومات {filteredPenalties.length > 0 && `(${filteredPenalties.length})`}
          </button>

          {isManagerOrAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('late_penalties')}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: activeTab === 'late_penalties' ? '#16a34a' : 'transparent',
                color: activeTab === 'late_penalties' ? '#ffffff' : 'var(--text)',
                boxShadow: activeTab === 'late_penalties' ? '0 2px 6px rgba(22,163,74,0.25)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <span>⏱️</span> جزاءات التأخير
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Disciplinary Penalties & Violation Counter Module */}
      {activeTab === 'disciplinary_penalties' && (
        <DisciplinaryPenaltiesTab
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          userRole={userRole}
          currentEmpId={currentEmpId}
          currentBranchId={currentBranchId}
          filterFn={filterFn}
          monthPicker={monthPicker}
          customFrom={customFrom}
          customTo={customTo}
          executeWithOwnerGuard={executeWithOwnerGuard}
        />
      )}

      {/* Tab 2: Bylaws Official Structured Clauses & Policies */}
      {activeTab === 'text' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '22px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
          {/* Section Header & Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px', borderBottom: '1.5px solid var(--border)', paddingBottom: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--primary-dark)', fontSize: '17px', fontWeight: 800 }}>
                  📜 نصوص وسياسات لائحة العمل الرسمية للصيدلية
                </h3>
                <span style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', padding: '3px 10px', borderRadius: '99px', fontSize: '11.5px', fontWeight: 'bold' }}>
                  {bylawsSections.length} بند وسياسة معتمدة
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                صياغة وتنظيم بنود وسياسات وضوابط ومحظورات العمل الرسمية التي تُستدعى تلقائياً في عقود الموظفين
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {isAdmin && (
                <>
                  <div style={{ display: 'inline-flex', background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '8px', padding: '3px' }}>
                    <button
                      type="button"
                      onClick={() => setBylawsViewMode('structured')}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        background: bylawsViewMode === 'structured' ? '#0f766e' : 'transparent',
                        color: bylawsViewMode === 'structured' ? '#fff' : 'var(--text)'
                      }}
                    >
                      🗂️ بنود تفاعلية
                    </button>
                    <button
                      type="button"
                      onClick={() => setBylawsViewMode('raw_text')}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        background: bylawsViewMode === 'raw_text' ? '#0f766e' : 'transparent',
                        color: bylawsViewMode === 'raw_text' ? '#fff' : 'var(--text)'
                      }}
                    >
                      📝 محرر النص
                    </button>
                  </div>

                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleResetDefaultBylawsText}
                    style={{ fontSize: '12px', color: 'var(--muted)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                    title="استعادة بنود اللائحة النموذجية المعتمدة للصيدلية (14 بنداً)"
                  >
                    🔄 استعادة النموذجية
                  </button>

                  <button
                    type="button"
                    className="btn btn-start"
                    onClick={handleSaveBylawsText}
                    style={{ background: '#0f766e', color: '#fff', fontWeight: 'bold', fontSize: '13px', padding: '7px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    💾 حفظ وتحديث اللائحة
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Admin: Structured Builder Mode */}
          {isAdmin && bylawsViewMode === 'structured' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span>💡 يمكنك تعديل عناوين البنود، وإضافة أو حذف الضوابط والنقاط، والتبديل بين نقطة عادية (▪) أو تحذير وحظر (❌) أو التزام (✔️).</span>
                <button
                  type="button"
                  onClick={handleAddBylawSection}
                  style={{ background: '#0f766e', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  ➕ إضافة بند جديد
                </button>
              </div>

              {bylawsSections.map((sec, sIdx) => {
                const isPreamble = sec.category === 'preamble' || sec.title?.includes('مقدمة') || sec.title?.includes('تمهيد');

                return (
                  <div
                    key={sec.id || `sec_${sIdx}`}
                    style={{
                      background: isPreamble ? '#f0fdfa' : '#ffffff',
                      border: `1.5px solid ${isPreamble ? '#99f6e4' : '#e2e8f0'}`,
                      borderRadius: '12px',
                      padding: '16px 18px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {/* Clause Header Bar */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 320px' }}>
                        <span style={{
                          background: isPreamble ? '#ccfbf1' : '#f1f5f9',
                          color: isPreamble ? '#0f766e' : '#334155',
                          fontWeight: 800,
                          fontSize: '11.5px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: `1px solid ${isPreamble ? '#99f6e4' : '#cbd5e1'}`,
                          whiteSpace: 'nowrap'
                        }}>
                          {isPreamble ? 'مقدمة' : `البند ${sIdx}`}
                        </span>

                        <input
                          type="text"
                          value={sec.title}
                          onChange={(e) => handleUpdateBylawSection(sec.id, 'title', e.target.value)}
                          placeholder="عنوان البند (مثال: أولاً: الانضباط العام ومواعيد العمل)"
                          style={{
                            flex: 1,
                            fontWeight: 800,
                            fontSize: '14px',
                            color: '#0f766e',
                            fontFamily: 'Cairo',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => handleMoveBylawSection(sIdx, 'up')}
                          disabled={sIdx === 0}
                          title="تحريك لأعلى"
                          style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', cursor: sIdx === 0 ? 'not-allowed' : 'pointer', opacity: sIdx === 0 ? 0.4 : 1, fontSize: '11px' }}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveBylawSection(sIdx, 'down')}
                          disabled={sIdx === bylawsSections.length - 1}
                          title="تحريك لأسفل"
                          style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 8px', cursor: sIdx === bylawsSections.length - 1 ? 'not-allowed' : 'pointer', opacity: sIdx === bylawsSections.length - 1 ? 0.4 : 1, fontSize: '11px' }}
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBylawSection(sec.id)}
                          title="حذف هذا البند"
                          style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                        >
                          🗑️ حذف
                        </button>
                      </div>
                    </div>

                    {/* Points / Policy Items */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                      {(sec.points || []).map((point, pIdx) => {
                        const pointStr = String(point || '');
                        const isWarning = pointStr.startsWith('❌');
                        const isObligation = pointStr.startsWith('✔️');

                        return (
                          <div
                            key={pIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: isWarning ? '#fef2f2' : isObligation ? '#f0fdf4' : '#f8fafc',
                              border: `1px solid ${isWarning ? '#fecaca' : isObligation ? '#bbf7d0' : '#e2e8f0'}`,
                              borderRadius: '8px',
                              padding: '5px 8px'
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleTogglePointMarker(sec.id, pIdx)}
                              title="انقر لتغيير الرمز (▪ عادي / ❌ حظر ومحظورات / ✔️ التزام وقاعدة)"
                              style={{
                                background: isWarning ? '#fee2e2' : isObligation ? '#dcfce7' : '#e2e8f0',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '3px 6px',
                                cursor: 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              {isWarning ? '❌' : isObligation ? '✔️' : '▪'}
                            </button>

                            <input
                              type="text"
                              value={pointStr.replace(/^❌\s*/, '').replace(/^✔️\s*/, '').replace(/^▪\s*/, '').replace(/^\-\s*/, '')}
                              onChange={(e) => {
                                const prefix = isWarning ? '❌ ' : isObligation ? '✔️ ' : '';
                                handleUpdatePoint(sec.id, pIdx, prefix + e.target.value);
                              }}
                              style={{
                                flex: 1,
                                border: 'none',
                                background: 'transparent',
                                fontSize: '13px',
                                fontFamily: 'Tajawal, sans-serif',
                                color: isWarning ? '#991b1b' : isObligation ? '#166534' : '#1e293b',
                                outline: 'none'
                              }}
                            />

                            <button
                              type="button"
                              onClick={() => handleDeletePoint(sec.id, pIdx)}
                              title="حذف هذه النقطة"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontSize: '13px',
                                padding: '2px 6px'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add Point Form inside this section */}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
                      <input
                        type="text"
                        placeholder="✍️ اكتب ضابطاً أو حظراً جديداً واضغط Enter أو زر الإضافة..."
                        id={`input_new_point_${sec.id}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.target.value.trim()) {
                            handleAddPointToSection(sec.id, e.target.value.trim());
                            e.target.value = '';
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px dashed #cbd5e1',
                          fontSize: '12px',
                          background: '#fff'
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const inputEl = document.getElementById(`input_new_point_${sec.id}`);
                          if (inputEl && inputEl.value.trim()) {
                            handleAddPointToSection(sec.id, inputEl.value.trim());
                            inputEl.value = '';
                          } else {
                            handleAddPointToSection(sec.id);
                          }
                        }}
                        style={{
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '11.5px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          color: '#334155'
                        }}
                      >
                        ➕ إضافة نقطة
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add New Section Big Button */}
              <button
                type="button"
                onClick={handleAddBylawSection}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  border: '2px dashed #0f766e',
                  background: '#f0fdfa',
                  color: '#0f766e',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>➕</span> إضافة بند وسياسة تنظيمية جديدة للائحة العمل
              </button>
            </div>
          )}

          {/* Admin: Raw Text Mode with Instant Live Sync */}
          {isAdmin && bylawsViewMode === 'raw_text' && (
            <div>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', color: '#92400e', marginBottom: '12px' }}>
                ℹ️ <strong>ملاحظة المزامنة الذكية:</strong> أي تعديل تجريه على النص أدناه يتم تحليله وتقسيمه تلقائياً إلى بنود وضوابط منظمة داخل عقود الموظفين والطباعة.
              </div>
              <textarea
                value={bylawsRawText}
                onChange={(e) => handleRawTextChange(e.target.value)}
                rows={16}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  fontFamily: 'Tajawal, monospace, sans-serif',
                  fontSize: '13.5px',
                  lineHeight: '1.8',
                  background: 'var(--surface-muted)',
                  resize: 'vertical'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', gap: '10px' }}>
                <button className="btn btn-start" onClick={handleSaveBylawsText} style={{ background: '#0f766e', color: '#fff', fontWeight: 'bold' }}>
                  💾 حفظ وتحديث نصوص اللائحة
                </button>
              </div>
            </div>
          )}

          {/* Read-Only Clean Cards for Employees / Non-Admins */}
          {!isAdmin && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
              {bylawsSections.map((sec, idx) => {
                const isPreamble = sec.category === 'preamble' || sec.title?.includes('مقدمة');
                return (
                  <div
                    key={sec.id || idx}
                    style={{
                      background: isPreamble ? '#f0fdfa' : '#f8fafc',
                      border: `1px solid ${isPreamble ? '#99f6e4' : '#e2e8f0'}`,
                      borderRadius: '10px',
                      padding: '14px',
                      fontSize: '12.5px'
                    }}
                  >
                    <div style={{ fontWeight: 800, color: '#0f766e', marginBottom: '8px', borderBottom: '1px dashed #cbd5e1', paddingBottom: '4px', fontSize: '13.5px' }}>
                      {sec.title}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#334155', lineHeight: 1.5 }}>
                      {(sec.points || []).map((p, pIdx) => {
                        const pStr = String(p || '');
                        const isWarning = pStr.startsWith('❌');
                        const isObligation = pStr.startsWith('✔️');
                        return (
                          <div key={pIdx} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '11px', marginTop: '2px', color: isWarning ? '#dc2626' : isObligation ? '#16a34a' : '#0f766e' }}>
                              {isWarning ? '❌' : isObligation ? '✔️' : '▪'}
                            </span>
                            <span style={{ color: isWarning ? '#991b1b' : isObligation ? '#166534' : '#334155' }}>
                              {pStr.replace(/^❌\s*/, '').replace(/^✔️\s*/, '').replace(/^▪\s*/, '').replace(/^\-\s*/, '')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Applied Penalty Records */}
      {activeTab === 'records' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '20px', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontFamily: 'Cairo', margin: 0, color: 'var(--primary-dark)' }}>
                📋 سجل الجزاءات والمخالفات اللائحية الموثقة
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                استعراض كافة الخصومات والجزاءات لجميع الموظفين بالفروع مع إمكانية التصفية المباشرة
              </p>
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '12px 16px', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>إجمالي الجزاءات بالسجل</span>
              <h4 style={{ margin: '4px 0 0', fontSize: '20px', color: '#1e293b' }}>{filteredPenalties.length} مخالفة</h4>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '12px 16px', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', color: '#166534' }}>مطبقة ومخصومة بالراتب</span>
              <h4 style={{ margin: '4px 0 0', fontSize: '20px', color: '#15803d' }}>{approvedCount} معتمدة</h4>
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '12px 16px', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', color: '#991b1b' }}>بانتظار قرار الإدارة</span>
              <h4 style={{ margin: '4px 0 0', fontSize: '20px', color: '#dc2626' }}>{pendingCount} معلقة</h4>
            </div>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '12px 16px', borderRadius: '10px' }}>
              <span style={{ fontSize: '12px', color: '#92400e' }}>إجمالي مبالغ الخصومات</span>
              <h4 style={{ margin: '4px 0 0', fontSize: '20px', color: '#b45309' }}>{totalFilteredDeduction.toFixed(2)} ج.م</h4>
            </div>
          </div>

          {/* Advanced Filter Bar */}
          <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', padding: '14px 16px', borderRadius: '12px', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <div style={{ flex: '1 1 200px' }}>
              <input
                type="text"
                placeholder="🔍 بحث بالاسم، الكود، نوع الجزاء..."
                value={recordsSearch}
                onChange={(e) => setRecordsSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
              />
            </div>

            {!currentEmpId && (
              <div>
                <select value={recordsBranch} onChange={(e) => setRecordsBranch(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}>
                  <option value="">🏢 جميع الفروع</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.branchCode})</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <select value={recordsStatus} onChange={(e) => setRecordsStatus(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}>
                <option value="all">📋 جميع الحالات</option>
                <option value="approved">🟢 المعتمدة والمخصومة</option>
                <option value="pending">⏳ المعلقة بانتظار الإدارة</option>
                <option value="rejected">🔴 المرفوعة المرفوضة</option>
                <option value="objection">✋ بها اعتراضات موظفين</option>
              </select>
            </div>

            <div>
              <select value={recordsPeriodMode} onChange={(e) => setRecordsPeriodMode(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: 'bold' }}>
                <option value="all">📅 كل الفترات (شامل)</option>
                <option value="current">📅 حسب فترة النظام الحالية</option>
                <option value="custom">📆 فترة مخصصة (من - إلى)</option>
              </select>
            </div>

            {recordsPeriodMode === 'custom' && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="date"
                  value={recordsCustomFrom}
                  onChange={(e) => setRecordsCustomFrom(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12.5px' }}
                />
                <span>إلى</span>
                <input
                  type="date"
                  value={recordsCustomTo}
                  onChange={(e) => setRecordsCustomTo(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12.5px' }}
                />
              </div>
            )}
          </div>

          {/* Records Table */}
          {isMobileScreen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredPenalties.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)', background: 'var(--surface-muted)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  لا توجد جزاءات أو خصومات مسجلة في هذا النطاق.
                </div>
              ) : (
                filteredPenalties.map((p) => {
                  const isApproved = p.status === 'approved' || p.adminApproved;
                  const isRejected = p.status === 'rejected';
                  const isCancelled = p.status === 'cancelled';
                  const hasObjection = Boolean(p.objection);
                  const objStatus = p.objection?.status;

                  return (
                    <div
                      key={p.id}
                      style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '14px',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.03)'
                      }}
                    >
                      {/* Card Header: Employee + Date + Amount */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                        <div>
                          <strong style={{ fontSize: '14px', color: 'var(--text)' }}>{p.employeeName}</strong>
                          <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>
                            كود: {p.employeeCode} {p.branchName ? `| فرع: ${p.branchName}` : ''}
                          </span>
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: p.amount > 0 ? 'rgba(220,38,38,0.1)' : 'var(--surface-muted)',
                            color: p.amount > 0 ? '#dc2626' : 'var(--muted)',
                            fontWeight: 800,
                            fontSize: '13px'
                          }}>
                            {p.amount > 0 ? `${p.amount} ج.م` : 'بدون خصم'}
                          </span>
                          <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>📅 {p.date}</span>
                        </div>
                      </div>

                      {/* Rule details */}
                      <div style={{ background: 'var(--surface-muted)', padding: '10px 12px', borderRadius: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <span className="badge badge-primary" style={{ fontSize: '11px' }}>{p.category}</span>
                          <strong style={{ fontSize: '12.5px', color: 'var(--primary-dark)' }}>{p.ruleTitle}</strong>
                        </div>
                        <div style={{ fontSize: '12.5px', color: 'var(--text)' }}>{p.reason}</div>
                        {p.details && p.details !== p.reason && (
                          <div style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '4px' }}>{p.details}</div>
                        )}
                      </div>

                      {/* Status & Actions Footer */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', paddingTop: '2px' }}>
                        <div>
                          {isCancelled ? (
                            <span className="badge badge-danger" style={{ fontSize: '11px' }}>ملغي ومسترد</span>
                          ) : isRejected ? (
                            <span className="badge badge-danger" style={{ fontSize: '11px' }}>مرفوض</span>
                          ) : isApproved ? (
                            <span className="badge badge-success" style={{ fontSize: '11px' }}>معتمد ومخصوم</span>
                          ) : (
                            <span className="badge badge-warning" style={{ fontSize: '11px' }}>معلق بانتظار الإدارة</span>
                          )}
                        </div>

                        <div>
                          {isAdmin ? (
                            hasObjection && objStatus === 'pending' ? (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  className="btn btn-start"
                                  style={{ fontSize: '11px', padding: '3px 8px', background: '#16a34a' }}
                                  onClick={() => handleAdminApproveObjection(p.id)}
                                >
                                  قبول وإلغاء
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  style={{ fontSize: '11px', padding: '3px 8px', color: '#dc2626' }}
                                  onClick={() => { setAdminRejectReplyReq(p); setAdminRejectReplyText(''); }}
                                >
                                  رفض
                                </button>
                              </div>
                            ) : hasObjection && objStatus === 'approved' ? (
                              <span className="badge badge-success" style={{ fontSize: '11px' }}>✅ قُبل الاعتراض</span>
                            ) : hasObjection && objStatus === 'rejected' ? (
                              <span className="badge badge-danger" style={{ fontSize: '11px' }}>❌ رُفض الاعتراض</span>
                            ) : null
                          ) : userRole === 'employee' ? (
                            hasObjection ? (
                              <span className={`badge ${objStatus === 'approved' ? 'badge-success' : objStatus === 'rejected' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '11px' }}>
                                {objStatus === 'approved' ? 'تم قبول الاعتراض' : objStatus === 'rejected' ? 'تم رفض الاعتراض' : 'الاعتراض قيد المراجعة'}
                              </span>
                            ) : !isCancelled ? (
                              <button
                                className="btn btn-outline"
                                style={{ color: '#dc2626', borderColor: '#dc2626', fontSize: '11px', padding: '3px 8px' }}
                                onClick={() => { setObjectionTargetReq(p); setObjectionReason(''); }}
                              >
                                ✋ تقديم اعتراض
                              </button>
                            ) : null
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="table-responsive">
              <table className="bylaws-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الموظف</th>
                    <th>الفرع</th>
                    <th>بند ونوع الجزاء</th>
                    <th>المقدار المالي</th>
                    <th>البيان والتفاصيل</th>
                    <th>الحالة</th>
                    <th>الاعتراضات والإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPenalties.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                        لا توجد جزاءات أو خصومات مسجلة في هذا النطاق.
                      </td>
                    </tr>
                  ) : (
                    filteredPenalties.map((p) => {
                      const isApproved = p.status === 'approved' || p.adminApproved;
                      const isRejected = p.status === 'rejected';
                      const isCancelled = p.status === 'cancelled';
                      const hasObjection = Boolean(p.objection);
                      const objStatus = p.objection?.status;

                      return (
                        <tr key={p.id}>
                          <td>{p.date}</td>
                          <td>
                            <strong>{p.employeeName}</strong>
                            <span style={{ display: 'block', fontSize: '11px', color: 'var(--muted)' }}>
                              {p.employeeCode}
                            </span>
                          </td>
                          <td>{p.branchName}</td>
                          <td>
                            <span className="badge badge-primary">{p.category}</span>
                            <strong style={{ display: 'block', fontSize: '13px', marginTop: '2px' }}>{p.ruleTitle}</strong>
                          </td>
                          <td style={{ fontWeight: '800', color: p.amount > 0 ? '#dc2626' : 'var(--muted)' }}>
                            {p.amount > 0 ? `${p.amount} ج.م` : 'بدون خصم مالي'}
                          </td>
                          <td style={{ maxWidth: '240px', fontSize: '12.5px' }}>
                            <div>{p.reason}</div>
                            {p.details && p.details !== p.reason && (
                              <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{p.details}</span>
                            )}
                          </td>
                          <td>
                            {isCancelled ? (
                              <span className="badge badge-danger">ملغي ومسترد</span>
                            ) : isRejected ? (
                              <span className="badge badge-danger">مرفوض</span>
                            ) : isApproved ? (
                              <span className="badge badge-success">معتمد ومخصوم</span>
                            ) : (
                              <span className="badge badge-warning">معلق بانتظار الإدارة</span>
                            )}
                          </td>
                          <td>
                            {isAdmin ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {hasObjection && objStatus === 'pending' && (
                                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '6px 8px', borderRadius: '6px', fontSize: '11px' }}>
                                    <strong style={{ color: '#b45309', display: 'block' }}>اعتراض مقدم:</strong>
                                    <span style={{ display: 'block', margin: '2px 0' }}>"{p.objection.reason}"</span>
                                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                                      <button
                                        className="btn btn-start"
                                        style={{ fontSize: '10.5px', padding: '2px 6px', background: '#16a34a' }}
                                        onClick={() => handleAdminApproveObjection(p.id)}
                                        title="قبول الاعتراض وإلغاء الجزاء"
                                      >
                                        قبول وإلغاء
                                      </button>
                                      <button
                                        className="btn btn-ghost"
                                        style={{ fontSize: '10.5px', padding: '2px 6px', color: '#dc2626' }}
                                        onClick={() => { setAdminRejectReplyReq(p); setAdminRejectReplyText(''); }}
                                        title="رفض الاعتراض وتثبيت الجزاء"
                                      >
                                        رفض
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {hasObjection && objStatus === 'approved' && (
                                  <span className="badge badge-success" style={{ fontSize: '11px' }}>✅ تم قبول الاعتراض</span>
                                )}
                                {hasObjection && objStatus === 'rejected' && (
                                  <span className="badge badge-danger" style={{ fontSize: '11px' }}>❌ تم رفض الاعتراض</span>
                                )}
                                {!hasObjection && (
                                  <span style={{ color: 'var(--muted)', fontSize: '12px' }}>—</span>
                                )}
                              </div>
                            ) : (
                              userRole === 'employee' ? (
                                hasObjection ? (
                                  <div>
                                    <span className={`badge ${objStatus === 'approved' ? 'badge-success' : objStatus === 'rejected' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '11px' }}>
                                      {objStatus === 'approved' ? 'تم قبول الاعتراض' : objStatus === 'rejected' ? 'تم رفض الاعتراض' : 'الاعتراض قيد المراجعة'}
                                    </span>
                                  </div>
                                ) : !isCancelled ? (
                                  <button
                                    className="btn btn-outline"
                                    style={{ color: '#dc2626', borderColor: '#dc2626', fontSize: '11.5px', padding: '4px 8px' }}
                                    onClick={() => { setObjectionTargetReq(p); setObjectionReason(''); }}
                                  >
                                    ✋ تقديم اعتراض
                                  </button>
                                ) : (
                                  <span style={{ color: 'var(--muted)', fontSize: '12px' }}>—</span>
                                )
                              ) : (
                                <span style={{ color: 'var(--muted)', fontSize: '12px' }}>{isApproved ? 'معتمد' : isRejected ? 'مرفوض' : 'معلق'}</span>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Late Penalties Module */}
      {activeTab === 'late_penalties' && (
        <LatePenaltyPolicyModule
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          userRole={userRole}
          currentEmpId={currentEmpId}
          currentBranchId={currentBranchId}
          filterFn={filterFn}
          monthPicker={monthPicker}
          customFrom={customFrom}
          customTo={customTo}
          executeWithOwnerGuard={executeWithOwnerGuard}
        />
      )}

      {/* Modal: Employee Submit Objection */}
      {objectionTargetReq && (
        <div className="modal-backdrop" onClick={() => setObjectionTargetReq(null)}>
          <div className="modal-card" style={{ maxWidth: '750px', width: '96%', padding: '28px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: 'Cairo', margin: 0, color: '#dc2626' }}>
                ✋ تقديم اعتراض للإدارة العليا على الجزاء اللائحي
              </h3>
              <button className="btn btn-ghost" onClick={() => setObjectionTargetReq(null)}>✕ إغلاق</button>
            </div>

            <div style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', marginBottom: '16px', fontSize: '13.5px', lineHeight: '1.7' }}>
              <div><strong>بند المخالفة:</strong> {objectionTargetReq.ruleTitle || 'جزاء لائحي'}</div>
              <div><strong>البيان والسبب:</strong> {objectionTargetReq.reason || objectionTargetReq.details}</div>
              <div><strong>تاريخ المخالفة:</strong> {new Date(objectionTargetReq.createdAt).toLocaleDateString('ar-EG')}</div>
            </div>

            <form onSubmit={handleSubmitObjection}>
              <div className="field" style={{ marginBottom: '20px' }}>
                <label style={{ fontWeight: '700', marginBottom: '8px', display: 'block' }}>
                  أسباب ومبررات الاعتراض على هذا الجزاء بالتفصيل:
                </label>
                <textarea
                  value={objectionReason}
                  onChange={(e) => setObjectionReason(e.target.value)}
                  placeholder="يرجى كتابة أسباب الاعتراض والمبررات أو الظروف التي حالت دون الالتزام..."
                  rows={4}
                  required
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '13.5px', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setObjectionTargetReq(null)}>إلغاء</button>
                <button type="submit" className="btn btn-start" style={{ background: '#dc2626' }}>
                  📤 إرسال الاعتراض للإدارة العليا
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Admin Reject Objection with Note */}
      {adminRejectReplyReq && (
        <div className="modal-backdrop" onClick={() => setAdminRejectReplyReq(null)}>
          <div className="modal-card" style={{ maxWidth: '650px', width: '96%', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Cairo', margin: '0 0 16px', color: '#dc2626' }}>
              ❌ رفض الاعتراض وتثبيت الجزاء
            </h3>

            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px' }}>
              <strong>اعتراض الموظف:</strong> "{adminRejectReplyReq.objection?.reason}"
            </div>

            <div className="field" style={{ marginBottom: '20px' }}>
              <label style={{ fontWeight: '700', marginBottom: '8px', display: 'block' }}>سبب رفض الاعتراض وملاحظات الإدارة العليا:</label>
              <textarea
                value={adminRejectReplyText}
                onChange={(e) => setAdminRejectReplyText(e.target.value)}
                placeholder="مثال: تمت دراسة المبررات ورؤي عدم كفايتها وتثبيت الجزاء المالي وفق لائحة العمل..."
                rows={3}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setAdminRejectReplyReq(null)}>إلغاء</button>
              <button
                type="button"
                className="btn btn-start"
                style={{ background: '#dc2626' }}
                onClick={() => handleAdminRejectObjection(adminRejectReplyReq.id, adminRejectReplyText)}
              >
                تأكيد الرفض وتثبيت الجزاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
