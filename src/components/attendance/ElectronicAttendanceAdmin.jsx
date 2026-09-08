import React, { useState, useMemo } from 'react';
import FaceRegistrationModal from './FaceRegistrationModal';
import FaceTestModal from './FaceTestModal';
import { saveFaceDescriptor, deleteFaceDescriptor, saveHandDescriptor, deleteHandDescriptor } from '../../utils/faceStorage';
import { getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';
import { useUI } from '../../context/UIContext';

export default function ElectronicAttendanceAdmin({ state, setState, saveState, showToast, executeWithOwnerGuard }) {
  const { showConfirm } = useUI();
  const [selectedEmp = null, setSelectedEmp] = useState(null);
  const [modalMode, setModalMode] = useState(null); // 'register' | 'test' | null

  // Suspension & Reactivation Modal States
  const [suspendingEmp, setSuspendingEmp] = useState(null);
  const [suspensionReasonInput, setSuspensionReasonInput] = useState('');
  const [reactivatingEmp, setReactivatingEmp] = useState(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'active' | 'suspended' | 'unregistered'

  // ── Top Sub-Tab: 'biometrics' | 'administrative' ──
  const [activeSubTab, setActiveSubTab] = useState('biometrics');

  // ── Administrative Staff States ──
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [isAddAdminModalOpen, setIsAddAdminModalOpen] = useState(false);
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');

  const employees = state.employees || [];
  const globalBiometricType = state.orgSettings?.biometricType || 'face';

  const copyAttendanceLink = (branchId) => {
    const link = branchId ? `${window.location.origin}/kiosk/${branchId}` : `${window.location.origin}/kiosk`;
    navigator.clipboard.writeText(link);
    if (showToast) {
      showToast('✅ تم نسخ رابط البصمة بنجاح: ' + link);
    } else {
      alert('تم نسخ رابط البصمة بنجاح: ' + link);
    }
  };

  const deletePrint = async (empId, type) => {
    const isHand = type === 'hand';
    const emp = employees.find(e => e.id === empId);
    const isConfirmed = await showConfirm({
      title: 'حذف البصمة الإلكترونية',
      message: `هل أنت متأكد من حذف بصمة ${isHand ? 'اليد' : 'الوجه'} للموظف (${emp?.name || ''})؟`,
      confirmText: 'تأكيد الحذف',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: isHand ? '✋' : '👤'
    });
    if (!isConfirmed) return;
    
    const performDelete = async () => {
      // Delete from Storage / DB
      if (isHand) {
        await deleteHandDescriptor(empId);
      } else {
        await deleteFaceDescriptor(empId);
      }

      const updatedEmployees = employees.map(emp => {
        if (emp.id === empId) {
          if (isHand) {
            const { hand_descriptor, has_hand_descriptor, ...rest } = emp;
            return rest;
          } else {
            const { face_descriptor, has_face_descriptor, ...rest } = emp;
            return rest;
          }
        }
        return emp;
      });

      const empNotif = {
        id: 'NOTIF-BIO-DELETED-' + Date.now(),
        type: 'biometric_cleared',
        title: '⚠️ تم مسح بصمتك الإلكترونية من قِبل الإدارة',
        message: `قامت الإدارة بمسح بصمة ${isHand ? 'اليد' : 'الوجه'} المسجلة لحسابك. يرجى تسجيل بصمة جديدة من صفحتك الشخصية لتتمكن من إثبات الحضور في الكشك.`,
        employeeId: empId,
        createdAt: new Date().toISOString(),
        read: false
      };

      const updatedState = { 
        ...state, 
        employees: updatedEmployees,
        notifications: [empNotif, ...(state.notifications || [])]
      };
      setState(updatedState);
      if (saveState) await saveState(updatedState);
      
      if (showToast) {
        showToast(`🗑️ تم حذف بصمة ${isHand ? 'اليد' : 'الوجه'} بنجاح وإشعار الموظف.`);
      } else {
        alert(`تم حذف بصمة ${isHand ? 'اليد' : 'الوجه'} بنجاح وإشعار الموظف.`);
      }
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockSuspendBiometric',
        actionTitle: `حذف بصمة ${isHand ? 'اليد' : 'الوجه'} للموظف (${emp?.name || empId})`,
        actionDetails: 'حذف بيانات البصمة المحفوظة للموظف نهائياً',
        onExecute: performDelete
      });
    } else {
      await performDelete();
    }
  };

  const updatePreferredBiometric = async (empId, type) => {
    const updatedEmployees = employees.map(emp => {
      if (emp.id === empId) {
        return { ...emp, preferred_biometric: type };
      }
      return emp;
    });
    const updatedState = { ...state, employees: updatedEmployees };
    setState(updatedState);
    if (saveState) await saveState(updatedState);
  };

  const handleRegisterSuccess = async (empId, descriptor, type) => {
    const isHand = type === 'hand';

    // 1. Save to local employee state immediately
    const updatedEmployees = employees.map(e => {
      if (e.id === empId) {
        if (isHand) {
          return { 
            ...e, 
            has_hand_descriptor: true, 
            hand_descriptor: descriptor, 
            preferred_biometric: 'hand' 
          };
        }
        return { 
          ...e, 
          has_face_descriptor: true, 
          face_descriptor: descriptor, 
          preferred_biometric: 'face' 
        };
      }
      return e;
    });
    
    const updatedState = { ...state, employees: updatedEmployees };
    setState(updatedState);
    if (saveState) await saveState(updatedState);

    // 2. Sync to Database
    const res = isHand 
      ? await saveHandDescriptor(empId, descriptor)
      : await saveFaceDescriptor(empId, descriptor);
      
    if (res.success) {
      const msg = `تم تسجيل وحفظ بصمة ${isHand ? 'اليد' : 'الوجه'} بنجاح في قاعدة البيانات! 🎉`;
      if (showToast) showToast(`✅ ${msg}`);
      else alert(msg);
    } else {
      console.error('[ElectronicAttendance] Sync error:', res.error);
      const errMsg = `⚠️ حدث خطأ أثناء الحفظ لبصمة ${isHand ? 'اليد' : 'الوجه'}. يرجى التأكد من اتصال السيرفر.`;
      if (showToast) showToast(errMsg);
      else alert(errMsg);
    }

    setModalMode(null);
  };

  // Suspend Biometric Action
  const handleConfirmSuspend = async () => {
    if (!suspendingEmp) return;
    const reason = suspensionReasonInput.trim() || 'إيقاف مؤقت عن العمل لحين انتهاء التحقيق';

    const performSuspend = async () => {
      const updatedEmployees = employees.map(emp => {
        if (emp.id === suspendingEmp.id) {
          return {
            ...emp,
            biometricSuspended: true,
            punchDisabled: true,
            accountSuspended: true,
            status: emp.status === 'تم الاستقالة' ? 'تم الاستقالة' : 'معلق',
            suspensionReason: reason,
            suspendedAt: new Date().toISOString(),
            suspendedBy: 'الإدارة العليا'
          };
        }
        return emp;
      });

      const updatedState = { ...state, employees: updatedEmployees };
      setState(updatedState);
      if (saveState) await saveState(updatedState);

      if (showToast) {
        showToast(`⛔ تم إيقاف بصمة وحساب الموظف (${suspendingEmp.name}) مؤقتاً بنجاح.`);
      }
      setSuspendingEmp(null);
      setSuspensionReasonInput('');
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockSuspendBiometric',
        actionTitle: `إيقاف بصمة الموظف (${suspendingEmp.name}) مؤقتاً`,
        actionDetails: `السبب: ${reason}`,
        onExecute: performSuspend
      });
    } else {
      await performSuspend();
    }
  };

  // Reactivate Biometric Action
  const handleConfirmReactivate = async () => {
    if (!reactivatingEmp) return;

    const performReactivate = async () => {
      const updatedEmployees = employees.map(emp => {
        if (emp.id === reactivatingEmp.id) {
          const { biometricSuspended, suspensionReason, suspendedAt, suspendedBy, punchDisabled, accountSuspended, ...rest } = emp;
          return {
            ...rest,
            biometricSuspended: false,
            punchDisabled: false,
            accountSuspended: false,
            status: emp.status === 'معلق' ? 'على رأس العمل' : emp.status,
            reactivatedAt: new Date().toISOString(),
            reactivatedBy: 'الإدارة العليا'
          };
        }
        return emp;
      });

      const updatedState = { ...state, employees: updatedEmployees };
      setState(updatedState);
      if (saveState) await saveState(updatedState);

      if (showToast) {
        showToast(`🟢 تم إعادة تفعيل بصمة وحساب وصلاحية حضور الموظف (${reactivatingEmp.name}) بنجاح!`);
      }
      setReactivatingEmp(null);
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockSuspendBiometric',
        actionTitle: `إعادة تفعيل بصمة الموظف (${reactivatingEmp.name})`,
        actionDetails: 'إعادة تفعيل صلاحية تسجيل البصمة والحضور',
        onExecute: performReactivate
      });
    } else {
      await performReactivate();
    }
  };

  // ── Administrative Staff Handlers ──
  const handleGrantAdministrative = async (empId) => {
    const targetEmp = employees.find(e => e.id === empId);
    if (!targetEmp) return;

    const performGrant = async () => {
      const updatedEmployees = employees.map(e => {
        if (e.id === empId) {
          return {
            ...e,
            isAdministrative: true,
            canPunchAnyBranch: true,
            administrativeGrantedAt: new Date().toISOString(),
            administrativeGrantedBy: 'الإدارة العليا'
          };
        }
        return e;
      });

      const notif = {
        id: 'NOTIF-ADMIN-ROLE-' + Date.now(),
        type: 'role_update',
        title: '👔 تم تعيينك كموظف إداري مصرح بكافة الفروع',
        message: 'تم منحك صلاحية البصمة الإلكترونية وإثبات الحضور في كافة فروع المؤسسة دون أي تقييد.',
        employeeId: empId,
        createdAt: new Date().toISOString(),
        read: false
      };

      const updatedState = {
        ...state,
        employees: updatedEmployees,
        notifications: [notif, ...(state.notifications || [])]
      };
      setState(updatedState);
      if (saveState) await saveState(updatedState);
      showToast?.(`✅ تم تعيين الموظف (${targetEmp.name}) كـ موظف إداري معتمد لكافة الفروع بنجاح`);
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockManageEmployees',
        actionTitle: `تعيين موظف إداري (${targetEmp.name})`,
        actionDetails: 'منح صلاحية البصمة في كافة فروع المؤسسة',
        onExecute: performGrant
      });
    } else {
      await performGrant();
    }
  };

  const handleRevokeAdministrative = async (empId) => {
    const targetEmp = employees.find(e => e.id === empId);
    if (!targetEmp) return;

    const isConfirmed = await showConfirm({
      title: 'إلغاء الصفة الإدارية للموظف',
      message: `هل أنت متأكد من إلغاء صفة (موظف إداري) عن (${targetEmp.name})؟ سيعود الموظف لوضعه الطبيعي ويقيد بالبصمة في فرعه الأساسي فقط.`,
      confirmText: 'تأكيد الإلغاء',
      cancelText: 'تراجع',
      type: 'warning',
      icon: '👔'
    });
    if (!isConfirmed) return;

    const performRevoke = async () => {
      const updatedEmployees = employees.map(e => {
        if (e.id === empId) {
          const { isAdministrative, canPunchAnyBranch, administrativeGrantedAt, administrativeGrantedBy, ...rest } = e;
          return {
            ...rest,
            isAdministrative: false,
            canPunchAnyBranch: false
          };
        }
        return e;
      });

      const updatedState = { ...state, employees: updatedEmployees };
      setState(updatedState);
      if (saveState) await saveState(updatedState);
      showToast?.(`ℹ️ تم إلغاء الصفة الإدارية عن الموظف (${targetEmp.name}) وإعادته لفرعه المحدد`);
    };

    if (executeWithOwnerGuard) {
      executeWithOwnerGuard({
        lockKey: 'lockManageEmployees',
        actionTitle: `إلغاء الصفة الإدارية عن (${targetEmp.name})`,
        actionDetails: 'إعادة الموظف لتقييد الفرع الأساسي',
        onExecute: performRevoke
      });
    } else {
      await performRevoke();
    }
  };

  // Administrative Staff List
  const administrativeEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (!isEmployeeActive(emp)) return false;
      const isAdmin = Boolean(emp.isAdministrative || emp.canPunchAnyBranch);
      if (!isAdmin) return false;
      if (adminSearchQuery.trim()) {
        const q = adminSearchQuery.trim().toLowerCase();
        const matchName = (emp.name || '').toLowerCase().includes(q);
        const matchNickname = (emp.nickname || '').toLowerCase().includes(q);
        const matchCode = (emp.code || '').toLowerCase().includes(q);
        const matchJob = (emp.jobTitle || '').toLowerCase().includes(q);
        if (!matchName && !matchNickname && !matchCode && !matchJob) return false;
      }
      return true;
    });
  }, [employees, adminSearchQuery]);

  const allAdminCount = employees.filter(e => isEmployeeActive(e) && (e.isAdministrative || e.canPunchAnyBranch)).length;
  const adminWithBioCount = employees.filter(e => isEmployeeActive(e) && (e.isAdministrative || e.canPunchAnyBranch) && (e.has_face_descriptor || e.face_descriptor || e.has_hand_descriptor || e.hand_descriptor)).length;

  // Candidates who are not yet administrative
  const nonAdminCandidates = useMemo(() => {
    return employees.filter(emp => {
      if (!isEmployeeActive(emp)) return false;
      const isAdmin = Boolean(emp.isAdministrative || emp.canPunchAnyBranch);
      if (isAdmin) return false;
      if (pickerSearchQuery.trim()) {
        const q = pickerSearchQuery.trim().toLowerCase();
        const matchName = (emp.name || '').toLowerCase().includes(q);
        const matchNickname = (emp.nickname || '').toLowerCase().includes(q);
        const matchCode = (emp.code || '').toLowerCase().includes(q);
        const matchJob = (emp.jobTitle || '').toLowerCase().includes(q);
        if (!matchName && !matchNickname && !matchCode && !matchJob) return false;
      }
      return true;
    });
  }, [employees, pickerSearchQuery]);

  // Filtered Employees List
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (!isEmployeeActive(emp)) return false;
      const empBiometricType = emp.preferred_biometric || globalBiometricType;
      const isHand = empBiometricType === 'hand';
      const hasBiometric = isHand 
        ? Boolean(emp.has_hand_descriptor || emp.hand_descriptor)
        : Boolean(emp.has_face_descriptor || emp.face_descriptor);
      const isSuspended = Boolean(emp.biometricSuspended || emp.punchDisabled || emp.accountSuspended || emp.status === 'معلق');

      // Status filter
      if (filterStatus === 'active') {
        if (!hasBiometric || isSuspended) return false;
      } else if (filterStatus === 'suspended') {
        if (!isSuspended) return false;
      } else if (filterStatus === 'unregistered') {
        if (hasBiometric) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = (emp.name || '').toLowerCase().includes(q);
        const matchNickname = (emp.nickname || '').toLowerCase().includes(q);
        const matchCode = (emp.code || '').toLowerCase().includes(q);
        const matchJob = (emp.jobTitle || '').toLowerCase().includes(q);
        if (!matchName && !matchNickname && !matchCode && !matchJob) return false;
      }

      return true;
    });
  }, [employees, filterStatus, searchQuery, globalBiometricType]);

  const activeEmployeesOnly = employees.filter(isEmployeeActive);
  const activeCount = activeEmployeesOnly.filter(e => !e.biometricSuspended && !e.punchDisabled && !e.accountSuspended && e.status !== 'معلق' && (e.has_face_descriptor || e.face_descriptor || e.has_hand_descriptor || e.hand_descriptor)).length;
  const suspendedCount = activeEmployeesOnly.filter(e => e.biometricSuspended || e.punchDisabled || e.accountSuspended || e.status === 'معلق').length;
  const unregisteredCount = activeEmployeesOnly.filter(e => !e.has_face_descriptor && !e.face_descriptor && !e.has_hand_descriptor && !e.hand_descriptor).length;

  return (
    <div className="module-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div className="module-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div className="module-title">
          <h2 style={{ margin: 0, fontFamily: 'Cairo', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📸</span> إدارة البصمة الإلكترونية الحيوية وتفعيل الحضور
          </h2>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '13px' }}>
            تسجيل واختبار بصمات الوجه واليد، وإدارة إيقاف وتفعيل صلاحيات الحضور الذاتي للموظفين مع تسجيل الأسباب
          </p>
        </div>
        <div className="module-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => copyAttendanceLink()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            🔗 نسخ الرابط العام لكشك البصمة
          </button>
          {state.branches && state.branches.map(b => (
            <button key={b.id} className="btn btn-ghost" style={{ border: '1px solid var(--border)', fontSize: '12px' }} onClick={() => copyAttendanceLink(b.id)}>
              🔗 كشك {b.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Top Tabs Navigation Bar ── */}
      <div style={{
        display: 'flex',
        gap: '10px',
        borderBottom: '2px solid var(--border)',
        paddingBottom: '12px',
        marginBottom: '4px'
      }}>
        <button
          type="button"
          className={`btn ${activeSubTab === 'biometrics' ? 'btn-start' : 'btn-ghost'}`}
          style={{
            padding: '10px 22px',
            fontSize: '13.5px',
            fontWeight: '800',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onClick={() => setActiveSubTab('biometrics')}
        >
          <span>📸</span> بصمات الموظفين الحيوية ({activeEmployeesOnly.length})
        </button>

        <button
          type="button"
          className={`btn ${activeSubTab === 'administrative' ? 'btn-start' : 'btn-ghost'}`}
          style={{
            padding: '10px 22px',
            fontSize: '13.5px',
            fontWeight: '800',
            borderRadius: '10px',
            background: activeSubTab === 'administrative' ? '#4f46e5' : 'transparent',
            color: activeSubTab === 'administrative' ? '#ffffff' : 'var(--text)',
            border: activeSubTab === 'administrative' ? '1px solid #4338ca' : '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onClick={() => setActiveSubTab('administrative')}
        >
          <span>👔</span> موظفين إداريين (بصمة كافة الفروع)
          <span style={{
            background: activeSubTab === 'administrative' ? '#ffffff' : '#4f46e5',
            color: activeSubTab === 'administrative' ? '#4f46e5' : '#ffffff',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: '900'
          }}>
            {allAdminCount}
          </span>
        </button>
      </div>

      {/* ── SUB-TAB 1: BIOMETRICS MANAGEMENT ── */}
      {activeSubTab === 'biometrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Stats & Filter Bar */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '16px', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn ${filterStatus === 'all' ? 'btn-start' : 'btn-ghost'}`}
            style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '20px' }}
            onClick={() => setFilterStatus('all')}
          >
            📋 كافة الموظفين ({employees.length})
          </button>
          <button
            type="button"
            className={`btn ${filterStatus === 'active' ? 'btn-start' : 'btn-ghost'}`}
            style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '20px', background: filterStatus === 'active' ? '#16a34a' : 'transparent', color: filterStatus === 'active' ? '#fff' : '#16a34a', border: '1px solid #16a34a' }}
            onClick={() => setFilterStatus('active')}
          >
            🟢 مفعلة ونشطة ({activeCount})
          </button>
          <button
            type="button"
            className={`btn ${filterStatus === 'suspended' ? 'btn-start' : 'btn-ghost'}`}
            style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '20px', background: filterStatus === 'suspended' ? '#dc2626' : 'transparent', color: filterStatus === 'suspended' ? '#fff' : '#dc2626', border: '1px solid #dc2626' }}
            onClick={() => setFilterStatus('suspended')}
          >
            🔴 موقوفة مؤقتاً ({suspendedCount})
          </button>
          <button
            type="button"
            className={`btn ${filterStatus === 'unregistered' ? 'btn-start' : 'btn-ghost'}`}
            style={{ padding: '6px 14px', fontSize: '12.5px', borderRadius: '20px', background: filterStatus === 'unregistered' ? '#64748b' : 'transparent', color: filterStatus === 'unregistered' ? '#fff' : '#64748b', border: '1px solid #94a3b8' }}
            onClick={() => setFilterStatus('unregistered')}
          >
            ⚪ غير مسجلة ({unregisteredCount})
          </button>
        </div>

        {/* Search Input */}
        <div style={{ minWidth: '220px', maxWidth: '300px', width: '100%' }}>
          <input
            type="text"
            placeholder="🔍 بحث باسم الموظف أو الكود..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Employees Biometrics Table */}
      <div className="table-responsive" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
        <table className="table" style={{ margin: 0 }}>
          <thead style={{ background: 'var(--surface-muted)' }}>
            <tr>
              <th>الموظف</th>
              <th>كود الموظف</th>
              <th>نوع البصمة المفضل</th>
              <th>حالة البصمة والتفعيل</th>
              <th>سبب الإيقاف (إن وجد)</th>
              <th style={{ textAlign: 'center' }}>الإجراءات والتحكم</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                  لا يوجد موظفين مطابقين لخيارات البحث أو التصفية الحالية.
                </td>
              </tr>
            ) : (
              filteredEmployees.map(emp => {
                const empBiometricType = emp.preferred_biometric || globalBiometricType;
                const isHand = empBiometricType === 'hand';
                const hasBiometric = isHand 
                  ? Boolean(emp.has_hand_descriptor || emp.hand_descriptor)
                  : Boolean(emp.has_face_descriptor || emp.face_descriptor);
                const isSuspended = Boolean(emp.biometricSuspended || emp.punchDisabled);
                const isTerminated = emp.status === 'تم الاستقالة' || emp.is_active === false || emp.isTerminated;

                return (
                  <tr key={emp.id} style={{ background: isSuspended ? '#fff5f5' : isTerminated ? '#f8fafc' : 'inherit' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: isSuspended ? '#fee2e2' : hasBiometric ? '#dcfce7' : '#f1f5f9',
                          color: isSuspended ? '#dc2626' : hasBiometric ? '#16a34a' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          fontSize: '14px'
                        }}>
                          {getEmpDisplayName(emp).slice(0, 1)}
                        </div>
                        <div>
                          <strong style={{ fontSize: '14px' }}>{getEmpDisplayName(emp)}</strong>
                          {emp.nickname && emp.nickname.trim() !== emp.name?.trim() && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>
                              الاسم الرسمي: {emp.name}
                            </span>
                          )}
                          <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--muted)' }}>
                            {emp.jobTitle || 'موظف'}
                          </span>
                          {(emp.isAdministrative || emp.canPunchAnyBranch) && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#eef2ff', color: '#4338ca', padding: '1px 6px', borderRadius: '5px', fontSize: '10.5px', fontWeight: '800', marginTop: '3px', border: '1px solid #c7d2fe' }}>
                              👔 إداري (كافة الفروع)
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '13px', background: 'var(--surface-muted)', padding: '2px 8px', borderRadius: '6px' }}>
                        {emp.code || '—'}
                      </span>
                    </td>
                    <td>
                      <select 
                        value={empBiometricType}
                        onChange={(e) => updatePreferredBiometric(emp.id, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}
                      >
                        <option value="face">👤 بصمة الوجه</option>
                        <option value="hand">✋ بصمة اليد</option>
                      </select>
                    </td>
                    <td>
                      {isTerminated ? (
                        <span style={{ color: '#475569', background: '#e2e8f0', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold' }}>
                          🚫 منهي خدمته / استقالة
                        </span>
                      ) : isSuspended ? (
                        <span style={{ color: '#dc2626', background: '#fee2e2', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '800', border: '1px solid #fca5a5' }}>
                          🔴 موقوفة مؤقتاً
                        </span>
                      ) : hasBiometric ? (
                        <span style={{ color: '#16a34a', background: '#dcfce7', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold' }}>
                          🟢 مفعلة ونشطة ({isHand ? 'يد' : 'وجه'})
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold' }}>
                          ⚪ غير مسجلة
                        </span>
                      )}
                    </td>
                    <td>
                      {isSuspended ? (
                        <div style={{ maxWidth: '240px' }}>
                          <span style={{ fontSize: '12px', color: '#991b1b', fontWeight: 'bold', display: 'block' }}>
                            {emp.suspensionReason || 'إيقاف مؤقت لحين انتهاء التحقيق'}
                          </span>
                          {emp.suspendedAt && (
                            <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>
                              منذ: {new Date(emp.suspendedAt).toLocaleDateString('ar-EG')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons" style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {/* Toggle Suspend / Reactivate Buttons */}
                        {isSuspended ? (
                          <button
                            type="button"
                            className="btn btn-start"
                            style={{ fontSize: '11.5px', padding: '4px 10px', background: '#16a34a' }}
                            onClick={() => setReactivatingEmp(emp)}
                          >
                            ▶️ إعادة تفعيل البصمة
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: '11.5px', padding: '4px 10px', color: '#dc2626', border: '1px solid #fca5a5' }}
                            onClick={() => {
                              setSuspendingEmp(emp);
                              setSuspensionReasonInput('إيقاف مؤقت عن العمل لحين انتهاء التحقيق');
                            }}
                          >
                            ⏸️ إيقاف مؤقت
                          </button>
                        )}

                        {/* Biometric Register & Test Buttons */}
                        <button 
                          className={`btn ${hasBiometric ? 'btn-outline' : 'btn-start'}`}
                          style={{ fontSize: '11.5px', padding: '4px 10px' }}
                          onClick={() => { setSelectedEmp(emp); setModalMode('register'); }}
                        >
                          {hasBiometric ? '🔄 إعادة التسجيل' : '➕ تسجيل البصمة'}
                        </button>
                        
                        {hasBiometric && (
                          <>
                            <button 
                              className="btn btn-primary"
                              style={{ fontSize: '11.5px', padding: '4px 10px' }}
                              onClick={() => { setSelectedEmp(emp); setModalMode('test'); }}
                            >
                              🔍 اختبار
                            </button>
                            <button 
                              className="btn btn-danger"
                              style={{ fontSize: '11.5px', padding: '4px 8px' }}
                              onClick={() => deletePrint(emp.id, empBiometricType)}
                              title="حذف البصمة"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )}

  {/* ── SUB-TAB 2: ADMINISTRATIVE STAFF (MULTI-BRANCH PUNCH) ── */}
  {activeSubTab === 'administrative' && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeIn 0.2s ease-out' }}>
      {/* Info Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.08), rgba(99, 102, 241, 0.03))',
        border: '1px solid #c7d2fe',
        borderRadius: '14px',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px'
      }}>
        <div style={{
          fontSize: '26px',
          width: '46px',
          height: '46px',
          borderRadius: '12px',
          background: '#e0e7ff',
          color: '#4338ca',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          👔
        </div>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: '800', color: '#312e81' }}>
            الموظفون الإداريون ومسؤولو الإشراف والمتابعة (تصريح البصمة في كافة الفروع)
          </h4>
          <p style={{ margin: 0, fontSize: '13px', color: '#4338ca', lineHeight: '1.6' }}>
            الموظفون المدرجون في هذا القسم يتم كسر قيد الفرع الجغرافي عنهم <strong>حصرياً</strong>؛ حيث يمكنهم تسجيل الحضور والانصراف والبصمة الإلكترونية في <strong>أي فرع من فروع المؤسسة دون أي قيود</strong>، وعبر روابط كشك كافة الفروع المباشرة، مع توثيق اسم وكود الفرع الذي تمت فيه البصمة بدقة في السجلات.
          </p>
        </div>
      </div>

      {/* KPI Cards & Actions Bar */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        padding: '16px',
        borderRadius: '14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{
            padding: '8px 16px',
            borderRadius: '10px',
            background: 'var(--surface-muted)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '18px' }}>👔</span>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>إجمالي الإداريين</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>{allAdminCount} موظف</div>
            </div>
          </div>

          <div style={{
            padding: '8px 16px',
            borderRadius: '10px',
            background: 'var(--surface-muted)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '18px' }}>📸</span>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>بصمات حيوية مكتملة</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#16a34a' }}>{adminWithBioCount} موظف</div>
            </div>
          </div>

          <div style={{
            padding: '8px 16px',
            borderRadius: '10px',
            background: 'var(--surface-muted)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '18px' }}>🏢</span>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>الفروع المتاحة للبصمة</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0284c7' }}>{(state.branches || []).length} فرع</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '220px', maxWidth: '280px' }}>
            <input
              type="text"
              placeholder="🔍 بحث في الموظفين الإداريين..."
              value={adminSearchQuery}
              onChange={(e) => setAdminSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
            />
          </div>

          <button
            type="button"
            className="btn btn-start"
            onClick={() => {
              setPickerSearchQuery('');
              setIsAddAdminModalOpen(true);
            }}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 800,
              background: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>➕</span> إضافة موظف إداري جديد
          </button>
        </div>
      </div>

      {/* Administrative Staff Table */}
      <div className="table-responsive" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
        <table className="table" style={{ margin: 0 }}>
          <thead style={{ background: 'var(--surface-muted)' }}>
            <tr>
              <th>الموظف الإداري</th>
              <th>كود الموظف</th>
              <th>الفرع الأساسي</th>
              <th>حالة البصمة الحيوية</th>
              <th>نطاق وتصريح البصمة</th>
              <th style={{ textAlign: 'center' }}>الإجراءات والتحكم</th>
            </tr>
          </thead>
          <tbody>
            {administrativeEmployees.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                  <div style={{ fontSize: '40px', marginBottom: '10px' }}>👔</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '6px', color: 'var(--text)' }}>
                    لا يوجد موظفون إداريون مضافون حالياً
                  </div>
                  <div style={{ fontSize: '13px', maxWidth: '480px', margin: '0 auto 16px auto', color: 'var(--muted)' }}>
                    قم بإضافة موظف إداري جديد لتمكينه من البصمة في أي فرع من فروع المؤسسة وعبر كافة روابط الكشك دون أي قيود.
                  </div>
                  <button
                    type="button"
                    className="btn btn-start"
                    onClick={() => {
                      setPickerSearchQuery('');
                      setIsAddAdminModalOpen(true);
                    }}
                    style={{ padding: '8px 18px', fontSize: '13px', background: '#4f46e5' }}
                  >
                    ➕ إضافة أول موظف إداري الآن
                  </button>
                </td>
              </tr>
            ) : (
              administrativeEmployees.map(emp => {
                const empBiometricType = emp.preferred_biometric || globalBiometricType;
                const isHand = empBiometricType === 'hand';
                const hasBiometric = isHand 
                  ? Boolean(emp.has_hand_descriptor || emp.hand_descriptor)
                  : Boolean(emp.has_face_descriptor || emp.face_descriptor);
                const isSuspended = Boolean(emp.biometricSuspended || emp.punchDisabled);
                const branchObj = (state.branches || []).find(b => String(b.id) === String(emp.branchId));

                return (
                  <tr key={emp.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: '#e0e7ff',
                          color: '#4338ca',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          fontSize: '14px'
                        }}>
                          {getEmpDisplayName(emp).slice(0, 1)}
                        </div>
                        <div>
                          <strong style={{ fontSize: '14px', color: 'var(--text)' }}>{getEmpDisplayName(emp)}</strong>
                          {emp.nickname && emp.nickname.trim() !== emp.name?.trim() && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block' }}>
                              الاسم الرسمي: {emp.name}
                            </span>
                          )}
                          <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--muted)' }}>
                            {emp.jobTitle || 'موظف إداري'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '13px', background: 'var(--surface-muted)', padding: '2px 8px', borderRadius: '6px' }}>
                        {emp.code || '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text)' }}>
                        🏢 {branchObj ? branchObj.name : (emp.branchName || 'الفرع الرئيسي')}
                      </span>
                    </td>
                    <td>
                      {isSuspended ? (
                        <span style={{ color: '#dc2626', background: '#fee2e2', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: '800', border: '1px solid #fca5a5' }}>
                          🔴 موقوفة مؤقتاً
                        </span>
                      ) : hasBiometric ? (
                        <span style={{ color: '#16a34a', background: '#dcfce7', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold', border: '1px solid #bbf7d0' }}>
                          🟢 مسجلة وجاهزة ({isHand ? 'بصمة يد' : 'بصمة وجه'})
                        </span>
                      ) : (
                        <span style={{ color: '#d97706', background: '#fef3c7', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold', border: '1px solid #fde68a' }}>
                          ⚠️ غير مسجلة (يلزم التسجيل)
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: '#ecfdf5',
                        color: '#047857',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '800',
                        border: '1px solid #a7f3d0'
                      }}>
                        <span>🌐</span> كافة الفروع ({(state.branches || []).length} فرع)
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {hasBiometric && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: '11.5px', padding: '4px 10px', border: '1px solid var(--border)' }}
                            onClick={() => {
                              setSelectedEmp(emp);
                              setModalMode('test');
                            }}
                          >
                            🔍 اختبار البصمة
                          </button>
                        )}
                        {!hasBiometric && (
                          <button
                            type="button"
                            className="btn btn-start"
                            style={{ fontSize: '11.5px', padding: '4px 10px', background: '#0f766e' }}
                            onClick={() => {
                              setSelectedEmp(emp);
                              setModalMode('register');
                            }}
                          >
                            ➕ تسجيل البصمة
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '11.5px', padding: '4px 10px', color: '#dc2626', border: '1px solid #fca5a5' }}
                          onClick={() => handleRevokeAdministrative(emp.id)}
                          title="إلغاء صفة إداري وإعادته لتقييد الفرع الأساسي فقط"
                        >
                          ✕ إلغاء صفة إداري
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )}

      {/* ── Modal: Suspend Biometric with Mandatory Reason ── */}
      {suspendingEmp && (
        <div className="modal-backdrop" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content card" style={{ maxWidth: '500px', width: '95%', padding: '24px', borderRadius: '16px', border: '2px solid #ef4444' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#991b1b', fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⏸️</span> إيقاف بصمة الموظف مؤقتاً
              </h3>
              <button type="button" className="btn btn-ghost" onClick={() => setSuspendingEmp(null)}>✕</button>
            </div>

            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: 'var(--text)' }}>
              أنت على وشك إيقاف بصمة وصلاحية تسجيل الحضور للموظف: <strong>{suspendingEmp.name} ({suspendingEmp.code})</strong>.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 'bold', marginBottom: '6px', color: '#991b1b' }}>
                سبب ومبررات إيقاف البصمة <span style={{ color: 'red' }}>*</span>:
              </label>
              <textarea
                rows={3}
                value={suspensionReasonInput}
                onChange={(e) => setSuspensionReasonInput(e.target.value)}
                placeholder="مثال: إيقاف مؤقت عن العمل لحين انتهاء التحقيق في واقعة معينة..."
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1.5px solid #f87171', fontSize: '13px', boxSizing: 'border-box' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px', display: 'block' }}>
                * سيتم إظهار هذا السبب للموظف عند محاولته إدخال الكود أو تسجيل الحضور في كشك البصمة.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setSuspendingEmp(null)}>
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmSuspend}
                disabled={!suspensionReasonInput.trim()}
                style={{ fontWeight: 'bold' }}
              >
                تأكيد إيقاف البصمة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Reactivate Biometric ── */}
      {reactivatingEmp && (
        <div className="modal-backdrop" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content card" style={{ maxWidth: '480px', width: '95%', padding: '24px', borderRadius: '16px', border: '2px solid #16a34a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#166534', fontSize: '16px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>▶️</span> إعادة تفعيل بصمة الموظف
              </h3>
              <button type="button" className="btn btn-ghost" onClick={() => setReactivatingEmp(null)}>✕</button>
            </div>

            <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: 'var(--text)', lineHeight: '1.6' }}>
              هل ترغب في إعادة تفعيل بصمة الموظف <strong>{reactivatingEmp.name} ({reactivatingEmp.code})</strong> والسماح له بتسجيل الحضور والانصراف بصورة طبيعية؟
            </p>

            {reactivatingEmp.suspensionReason && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: '#991b1b' }}>
                <strong>سبب الإيقاف السابق:</strong> {reactivatingEmp.suspensionReason}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setReactivatingEmp(null)}>
                إلغاء
              </button>
              <button
                type="button"
                className="btn btn-start"
                onClick={handleConfirmReactivate}
                style={{ fontWeight: 'bold', background: '#16a34a' }}
              >
                تأكيد إعادة التفعيل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Face Registration Modal */}
      {modalMode === 'register' && selectedEmp && (
        <FaceRegistrationModal 
          employee={selectedEmp}
          onClose={() => setModalMode(null)}
          onSuccess={(descriptor, type) => handleRegisterSuccess(selectedEmp.id, descriptor, type)}
          biometricType={selectedEmp.preferred_biometric || globalBiometricType}
        />
      )}

      {/* Face Test Modal */}
      {modalMode === 'test' && selectedEmp && (
        <FaceTestModal 
          employee={selectedEmp}
          onClose={() => setModalMode(null)}
          biometricType={selectedEmp.preferred_biometric || globalBiometricType}
        />
      )}

      {/* ── Add Administrative Employee Modal ── */}
      {isAddAdminModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(5px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '650px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>➕</span> تعيين موظف إداري معتمد (بصمة كافة الفروع)
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--muted)' }}>
                  اختر موظفاً لمنحه صلاحية تسجيل البصمة في كافة فروع المؤسسة وروابط الكشك دون قيود.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsAddAdminModalOpen(false)}
                style={{ fontSize: '16px', padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Search Bar */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
              <input
                type="text"
                placeholder="🔍 ابحث بالاسم أو الكود أو المسمى الوظيفي..."
                value={pickerSearchQuery}
                onChange={(e) => setPickerSearchQuery(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  fontSize: '13px',
                  background: 'var(--surface)'
                }}
              />
            </div>

            {/* Candidate List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {nonAdminCandidates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--muted)', fontSize: '13px' }}>
                  {pickerSearchQuery ? 'لا يوجد موظفون مطابقون لكلمات البحث.' : 'كافة الموظفين مضافون بالفعل كإداريين أو لا يوجد موظفون نشطون.'}
                </div>
              ) : (
                nonAdminCandidates.map(emp => {
                  const branchObj = (state.branches || []).find(b => String(b.id) === String(emp.branchId));
                  const hasBio = Boolean(emp.has_face_descriptor || emp.face_descriptor || emp.has_hand_descriptor || emp.hand_descriptor);

                  return (
                    <div
                      key={emp.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          background: '#f1f5f9',
                          color: '#475569',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '13px'
                        }}>
                          {getEmpDisplayName(emp).slice(0, 1)}
                        </div>
                        <div>
                          <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)' }}>
                            {getEmpDisplayName(emp)}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--muted)', display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}>
                            <span>كود: <strong>{emp.code || '—'}</strong></span>
                            <span>·</span>
                            <span>{emp.jobTitle || 'موظف'}</span>
                            <span>·</span>
                            <span>🏢 {branchObj ? branchObj.name : (emp.branchName || 'الفرع الرئيسي')}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {hasBio ? (
                          <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>
                            🟢 بصمة مسجلة
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 600 }}>
                            ⚪ بدون بصمة
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn btn-start"
                          onClick={() => {
                            handleGrantAdministrative(emp.id);
                            setIsAddAdminModalOpen(false);
                          }}
                          style={{
                            padding: '6px 14px',
                            fontSize: '12px',
                            fontWeight: 800,
                            background: '#4f46e5',
                            borderRadius: '8px'
                          }}
                        >
                          ➕ تعيين كإداري
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              background: 'var(--surface-muted)'
            }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsAddAdminModalOpen(false)}
                style={{ padding: '6px 16px', fontSize: '13px' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
