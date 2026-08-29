import React, { useState, useMemo } from 'react';
import { fmt, getRealTodayStr, getEmpDisplayName, isEmployeeActive } from '../../utils/formatters';
import EmployeeTerminationModal from './EmployeeTerminationModal';
import EmployeeComprehensiveDossierModal from './EmployeeComprehensiveDossierModal';

export default function EmployeeCardsGrid({
  state,
  setState,
  saveState,
  showToast,
  monthPicker,
  filterFn,
  computeEmpSummary,
  openEmpCard,
  openEditEmpModal,
  handleDeleteEmp,
  getActiveElapsedStr,
  getActiveBreakStr,
  pauseShift,
  resumeShift,
  stopShift,
  importEmployeesFromExcel,
  exportEmployeesToExcel,
  openAddEmpModal,
  openEmpPhonesModal,
  onTerminateEmployee,
  onReinstateEmployee
}) {
  const [activeMainTab, setActiveMainTab] = useState('active'); // 'active' | 'resigned'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('all');

  // Modals state
  const [terminationModalEmp, setTerminationModalEmp] = useState(null);
  const [dossierModalEmp, setDossierModalEmp] = useState(null);
  const [dossierInitialTab, setDossierInitialTab] = useState('summary');
  const [rehireModalEmp, setRehireModalEmp] = useState(null);
  const [rehireDate, setRehireDate] = useState(getRealTodayStr());
  const [rehireBranchId, setRehireBranchId] = useState('');
  const [rehireNotes, setRehireNotes] = useState('');
  const [isRehiring, setIsRehiring] = useState(false);
  const [previewPhotoEmp, setPreviewPhotoEmp] = useState(null);

  const branches = state.branches || [];
  const employees = state.employees || [];
  const empRequests = state.resignationRequests || [];

  const parseDateStr = (s) => {
    if (!s) return new Date();
    const c = String(s).slice(0, 10);
    const p = c.split('-');
    if (p.length === 3) return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return new Date(s);
  };

  // Helper for resignation notice end date & remaining days calculation
  const getResignationNoticeDetails = (start, days) => {
    const nDays = parseInt(days, 10) || 0;
    if (nDays <= 0) return { endDate: '', remainingDays: 0 };
    const sDate = parseDateStr(start || getRealTodayStr());
    const eDate = new Date(sDate);
    eDate.setDate(eDate.getDate() + nDays);
    const endDate = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}-${String(eDate.getDate()).padStart(2, '0')}`;
    
    const today = parseDateStr(getRealTodayStr());
    const diffMs = eDate.getTime() - today.getTime();
    const remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return { endDate, remainingDays };
  };

  // Group employees by branch
  const getBranchName = (bId) => {
    const b = branches.find((item) => String(item.id) === String(bId));
    return b ? `${b.name} (${b.branchCode})` : 'المركز الرئيسي / بدون فرع';
  };

  // Split Active vs Resigned
  const activeEmployeesList = useMemo(() => {
    return employees.filter(isEmployeeActive);
  }, [employees]);

  const resignedEmployeesList = useMemo(() => {
    return employees.filter((emp) => !isEmployeeActive(emp));
  }, [employees]);

  // Current list based on active tab and search filters
  const displayedEmployees = useMemo(() => {
    const baseList = activeMainTab === 'active' ? activeEmployeesList : resignedEmployeesList;
    return baseList.filter((emp) => {
      // Branch filter
      if (selectedBranchFilter !== 'all') {
        const matchesMain = String(emp.branchId) === String(selectedBranchFilter);
        const matchesDetails = emp.branchesDetails?.some((b) => String(b.branchId) === String(selectedBranchFilter));
        if (!matchesMain && !matchesDetails) return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matchName = emp.name?.toLowerCase().includes(term);
        const matchNickname = emp.nickname?.toLowerCase().includes(term);
        const matchCode = emp.code?.toLowerCase().includes(term);
        const matchJob = emp.jobTitle?.toLowerCase().includes(term);
        const matchPhone = emp.phone?.includes(term);
        if (!matchName && !matchNickname && !matchCode && !matchJob && !matchPhone) return false;
      }
      return true;
    });
  }, [activeMainTab, activeEmployeesList, resignedEmployeesList, selectedBranchFilter, searchTerm]);

  // Grouping map for displayed employees
  const groupedEmployees = useMemo(() => {
    const grouped = {};
    displayedEmployees.forEach((emp) => {
      if (selectedBranchFilter !== 'all') {
        // When a specific branch is selected in filter, strictly group under that branch only
        const key = selectedBranchFilter;
        if (!grouped[key]) grouped[key] = [];
        if (!grouped[key].some((e) => String(e.id) === String(emp.id))) {
          grouped[key].push(emp);
        }
      } else {
        if (emp.branchesDetails && emp.branchesDetails.length > 0) {
          emp.branchesDetails.forEach((bd) => {
            const key = bd.branchId || 'main';
            if (!grouped[key]) grouped[key] = [];
            if (!grouped[key].some((e) => String(e.id) === String(emp.id))) {
              grouped[key].push(emp);
            }
          });
        } else {
          const key = emp.branchId || 'main';
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(emp);
        }
      }
    });
    return grouped;
  }, [displayedEmployees, selectedBranchFilter]);

  // Handle Termination
  const handleConfirmTermination = async (empId, data) => {
    if (onTerminateEmployee) {
      await onTerminateEmployee(empId, data);
      setTerminationModalEmp(null);
      return;
    }

    // Default internal handler
    const updatedEmployees = employees.map((e) => {
      if (String(e.id) === String(empId)) {
        return {
          ...e,
          status: 'تم الاستقالة',
          is_active: false,
          fingerprint_active: false,
          terminationReason: data.terminationReason,
          terminationDate: data.terminationDate,
          resignationDate: data.terminationDate,
          terminationNotes: data.clearanceNotes,
          terminatedAt: new Date().toISOString(),
          finalSettlement: data.settlement,
          signedClearanceDoc: data.signedClearanceDoc || e.signedClearanceDoc || null,
          updatedAt: new Date().toISOString()
        };
      }
      return e;
    });

    const updatedActiveShifts = { ...(state.activeShifts || {}) };
    delete updatedActiveShifts[empId];
    delete updatedActiveShifts[String(empId)];

    const updatedState = {
      ...state,
      employees: updatedEmployees,
      activeShifts: updatedActiveShifts
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);
    if (showToast) showToast('✅ تم إنهاء خدمة الموظف وتصفية حسابه المالي ونقله لتبويبة المستقيلين');

    setTerminationModalEmp(null);
  };

  // Handle Save / Delete Signed Clearance Document
  const handleSaveSignedClearance = async (empId, signedDoc) => {
    const updatedEmployees = employees.map((e) => {
      if (String(e.id) === String(empId)) {
        return {
          ...e,
          signedClearanceDoc: signedDoc,
          updatedAt: new Date().toISOString()
        };
      }
      return e;
    });

    const updatedState = {
      ...state,
      employees: updatedEmployees
    };

    if (setState) setState(updatedState);
    if (saveState) await saveState(updatedState);

    // Update active modal emp reference in real-time
    if (dossierModalEmp && String(dossierModalEmp.id) === String(empId)) {
      setDossierModalEmp({ ...dossierModalEmp, signedClearanceDoc: signedDoc });
    }
    if (terminationModalEmp && String(terminationModalEmp.id) === String(empId)) {
      setTerminationModalEmp({ ...terminationModalEmp, signedClearanceDoc: signedDoc });
    }

    if (showToast) {
      showToast(signedDoc ? '✅ تم حفظ وأرشفة إخلاء الطرف الموقع بنجاح' : '🗑️ تم حذف مستند إخلاء الطرف');
    }
  };

  // Handle Rehire / Reinstate
  const handleConfirmRehire = async (e) => {
    e.preventDefault();
    if (!rehireModalEmp) return;

    setIsRehiring(true);
    try {
      if (onReinstateEmployee) {
        await onReinstateEmployee(rehireModalEmp.id, {
          rehireDate,
          rehireBranchId: rehireBranchId || rehireModalEmp.branchId || 'main',
          rehireNotes
        });
      } else {
        const updatedEmployees = employees.map((emp) => {
          if (String(emp.id) === String(rehireModalEmp.id)) {
            return {
              ...emp,
              status: 'على رأس العمل',
              is_active: true,
              fingerprint_active: true,
              suspension_reason: '',
              branchId: rehireBranchId || emp.branchId || 'main',
              rejoinDate: rehireDate,
              reinstatedAt: new Date().toISOString(),
              reinstatementNotes: rehireNotes.trim(),
              updatedAt: new Date().toISOString()
            };
          }
          return emp;
        });

        const updatedState = {
          ...state,
          employees: updatedEmployees
        };

        if (setState) setState(updatedState);
        if (saveState) await saveState(updatedState);
        if (showToast) showToast(`✅ تم إعادة الموظف (${rehireModalEmp.name}) على رأس العمل بنجاح مع الاحتفاظ بكامل سجلاته التاريخية`);
      }

      setRehireModalEmp(null);
      setRehireNotes('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsRehiring(false);
    }
  };

  return (
    <>
      {/* ── TOP SECTION HEADER & TAB CONTROLS ── */}
      <div className="section-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontFamily: 'Cairo', color: 'var(--text)' }}>
            👥 إدارة ملفات وشؤون الموظفين
          </h2>
          <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
            إجمالي القوى العاملة المسجلة: <strong>{employees.length} موظف</strong> (النشطون: {activeEmployeesList.length} · المستقيلون: {resignedEmployeesList.length})
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={openEmpPhonesModal}
            style={{
              background: 'var(--primary-light, #e0f2fe)',
              color: 'var(--primary-dark, #0369a1)',
              border: '1px solid var(--primary-tint, #bae6fd)',
              fontWeight: 800,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📞</span> أرقام الموظفين
          </button>
          <label className="btn btn-ghost" style={{ cursor: 'pointer', margin: 0, fontSize: '13px' }}>
            📤 استيراد Excel
            <input type="file" accept=".xlsx, .xls" onChange={importEmployeesFromExcel} style={{ display: 'none' }} />
          </label>
          <button className="btn btn-ghost" onClick={exportEmployeesToExcel} style={{ fontSize: '13px' }}>
            📥 تصدير Excel
          </button>
          <button className="btn-add-job" onClick={openAddEmpModal} style={{ fontSize: '13px' }}>
            + إضافة موظف جديد
          </button>
        </div>
      </div>

      {/* ── MODERN MAIN TABS (ACTIVE vs RESIGNED) ── */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', borderBottom: '2px solid var(--border)', paddingBottom: '14px' }}>
        <button
          type="button"
          onClick={() => setActiveMainTab('active')}
          style={{
            padding: '11px 24px',
            borderRadius: '14px',
            border: activeMainTab === 'active' ? '1px solid rgba(13, 148, 136, 0.4)' : '1px solid var(--border)',
            background: activeMainTab === 'active' ? 'linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)' : 'var(--surface)',
            color: activeMainTab === 'active' ? '#fff' : 'var(--text-secondary)',
            fontWeight: '800',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: activeMainTab === 'active' ? '0 4px 14px rgba(13,148,136,0.3)' : 'var(--shadow-sm)',
            transition: 'all 0.2s ease'
          }}
        >
          <span>🟢 الموظفون الحاليون (على رأس العمل)</span>
          <span
            style={{
              background: activeMainTab === 'active' ? 'rgba(255,255,255,0.25)' : 'var(--surface-muted)',
              color: activeMainTab === 'active' ? '#fff' : 'var(--primary)',
              padding: '2px 8px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '900',
              border: activeMainTab === 'active' ? 'none' : '1px solid var(--border)'
            }}
          >
            {activeEmployeesList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('resigned')}
          style={{
            padding: '11px 24px',
            borderRadius: '14px',
            border: activeMainTab === 'resigned' ? '1px solid rgba(220, 38, 38, 0.4)' : '1px solid var(--border)',
            background: activeMainTab === 'resigned' ? 'linear-gradient(135deg, var(--danger-dark) 0%, var(--danger) 100%)' : 'var(--surface)',
            color: activeMainTab === 'resigned' ? '#fff' : 'var(--text-secondary)',
            fontWeight: '800',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: activeMainTab === 'resigned' ? '0 4px 14px rgba(220,38,38,0.3)' : 'var(--shadow-sm)',
            transition: 'all 0.2s ease'
          }}
        >
          <span>📁 المستقيلون ومنتهية خدمتهم</span>
          <span
            style={{
              background: activeMainTab === 'resigned' ? 'rgba(255,255,255,0.25)' : 'var(--danger-tint)',
              color: activeMainTab === 'resigned' ? '#fff' : 'var(--danger)',
              padding: '2px 8px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '900'
            }}
          >
            {resignedEmployeesList.length}
          </span>
        </button>
      </div>

      {/* ── SEARCH & FILTER TOOLBAR ── */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 260px', position: 'relative' }}>
          <input
            type="text"
            placeholder={`🔍 البحث في ${activeMainTab === 'active' ? 'الموظفين الحاليين' : 'المستقيلين'} بالاسم، الكود، الوظيفة أو الهاتف...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '11px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: '13.5px',
              boxSizing: 'border-box'
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)' }}
            >
              ✕
            </button>
          )}
        </div>

        <div style={{ minWidth: '180px' }}>
          <select
            value={selectedBranchFilter}
            onChange={(e) => setSelectedBranchFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '11px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: '13.5px',
              boxSizing: 'border-box'
            }}
          >
            <option value="all">🏬 جميع الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── NO RESULTS ALERT ── */}
      {displayedEmployees.length === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '40px 20px', textAlign: 'center', color: 'var(--muted)', boxShadow: 'var(--shadow-sm)' }}>
          <span style={{ fontSize: '40px', display: 'block', marginBottom: '10px' }}>
            {activeMainTab === 'active' ? '👥' : '📁'}
          </span>
          <h3 style={{ margin: '0 0 6px', color: 'var(--text)' }}>
            {activeMainTab === 'active' ? 'لا يوجد موظفون على رأس العمل يطابقون البحث' : 'لا يوجد موظفون مستقيلون أو منتهية خدمتهم'}
          </h3>
          <p style={{ fontSize: '13px', margin: 0 }}>
            {activeMainTab === 'active' ? 'يمكنك إضافة موظف جديد من الزر بالأعلى' : 'عند إنهاء خدمة أي موظف سيتم نقله وحفظ سجلاته الكاملة هنا'}
          </p>
        </div>
      )}

      {/* ── RENDER BRANCH GROUPS & EMPLOYEE CARDS ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        {Object.keys(groupedEmployees).map((branchKey) => {
          const branchEmps = groupedEmployees[branchKey];
          if (!branchEmps || branchEmps.length === 0) return null;
          const branchTitle = getBranchName(branchKey);

          return (
            <div key={branchKey} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
              {/* Branch Header Banner */}
              <div
                style={{
                  background: activeMainTab === 'active'
                    ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
                    : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                  color: '#fff',
                  padding: '12px 20px',
                  borderRadius: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <h3 style={{ margin: 0, fontFamily: 'Cairo', fontSize: '16.5px', color: '#fff' }}>
                  🏬 {branchTitle} {activeMainTab === 'resigned' ? '(المستقيلون)' : ''}
                </h3>
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold' }}>
                  {branchEmps.length} موظف
                </span>
              </div>

              {/* Full Width Horizontal Rectangular Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {branchEmps.map((emp) => {
                  const active = state.activeShifts?.[emp.id];
                  const empSum = computeEmpSummary ? computeEmpSummary(emp.id, filterFn) : { hours: 0, netSalary: 0 };
                  
                  const empIdStr = String(emp.id || '').trim();
                  const empCodeStr = String(emp.code || '').trim();
                  const empUserStr = String(emp.username || '').trim();

                  // Resignation requests details
                  const empReqs = empRequests
                    .filter((r) => {
                      const rId = String(r.employeeId || '').trim();
                      return rId === empIdStr || (empCodeStr && rId === empCodeStr) || (empUserStr && rId === empUserStr);
                    })
                    .sort((a, b) => {
                      const tB = new Date(b.createdAt || b.updatedAt || b.requestDate || 0).getTime();
                      const tA = new Date(a.createdAt || a.updatedAt || a.requestDate || 0).getTime();
                      return tB - tA;
                    });

                  const latestReq = empReqs[0];
                  const hasApprovedWithdraw = latestReq && latestReq.type === 'withdraw' && (latestReq.adminStatus === 'approved' || latestReq.managerStatus === 'approved');

                  let resStatusBadge = null;

                  if (emp.status === 'تم الاستقالة' || emp.is_active === false) {
                    const reasonText = emp.terminationReason || emp.suspension_reason || 'تم إنهاء الخدمة';
                    const termDate = emp.terminationDate || emp.resignationDate || emp.terminatedAt?.slice(0, 10);
                    resStatusBadge = (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                        <span style={{ background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold', border: '1px solid #fca5a5' }}>
                          🔴 إنهاء الخدمة: {reasonText}
                        </span>
                        {termDate && (
                          <span style={{ background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', border: '1px solid #cbd5e1' }}>
                            📅 تاريخ: {termDate}
                          </span>
                        )}
                        {emp.finalSettlement && (
                          <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold', border: '1px solid #86efac' }}>
                            💰 صافي المخالصة: {fmt(emp.finalSettlement.netSettlement || 0)} ج.م
                          </span>
                        )}
                      </div>
                    );
                  } else if (!hasApprovedWithdraw && empReqs.length > 0) {
                    const activeRes = empReqs.find((r) => r.type === 'resignation' && !r.isCancelled && r.adminStatus !== 'cancelled');
                    if (activeRes) {
                      if (activeRes.adminStatus === 'approved') {
                        const { endDate, remainingDays } = getResignationNoticeDetails(activeRes.conditionsStartDate || activeRes.requestDate, activeRes.conditionsDaysRemaining);
                        if (remainingDays > 0 && activeRes.employeeConditionStatus !== 'rejected') {
                          resStatusBadge = (
                            <div style={{ background: 'var(--warning-light, #fef3c7)', color: 'var(--warning-dark, #92400e)', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', marginTop: '6px', display: 'inline-block', border: '1px solid #fde68a' }}>
                              ⏳ متبقي على إنهاء الخدمة: {remainingDays} يوم عمل (تاريخ الانتهاء: {endDate})
                            </div>
                          );
                        }
                      } else if (activeRes.adminStatus === 'pending') {
                        resStatusBadge = (
                          <div style={{ background: 'var(--primary-light, #e0f2fe)', color: 'var(--primary-dark, #0369a1)', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', marginTop: '6px', display: 'inline-block', border: '1px solid #bae6fd' }}>
                            📝 استقالة قيد المراجعة
                          </div>
                        );
                      }
                    }
                  }

                  const isEmpTerminated = emp.status === 'تم الاستقالة' || emp.is_active === false;

                  return (
                    <div
                      key={emp.id}
                      style={{
                        background: 'var(--surface)',
                        border: isEmpTerminated ? '1px solid var(--danger-border, #fca5a5)' : '1px solid var(--border)',
                        borderRadius: '16px',
                        padding: '18px 22px',
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '16px',
                        width: '100%',
                        boxSizing: 'border-box',
                        boxShadow: 'var(--shadow-sm)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {/* Left Block: Avatar, Name, Title & Code */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '260px', flex: 1 }}>
                        <div
                          className="emp-avatar-circle"
                          style={{
                            width: '52px',
                            height: '52px',
                            flexShrink: 0,
                            opacity: isEmpTerminated ? 0.75 : 1,
                            cursor: (emp.photoUrl || emp.photo) ? 'pointer' : 'default',
                            transition: 'transform 0.15s ease'
                          }}
                          onClick={() => {
                            if (emp.photoUrl || emp.photo) {
                              setPreviewPhotoEmp(emp);
                            }
                          }}
                          title={emp.photoUrl || emp.photo ? '🔍 انقر لمعاينة وتكبير صورة الموظف' : ''}
                        >
                          {emp.photoUrl || emp.photo ? (
                            <img src={emp.photoUrl || emp.photo} alt={getEmpDisplayName(emp)} className="emp-img" />
                          ) : (
                            <span style={{ fontSize: '20px' }}>{getEmpDisplayName(emp).charAt(0)}</span>
                          )}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontFamily: 'Cairo', fontSize: '17px', color: isEmpTerminated ? 'var(--danger-dark, #dc2626)' : 'var(--text)' }}>
                              {getEmpDisplayName(emp)}
                            </h3>
                            {emp.nickname && emp.nickname.trim() !== emp.name?.trim() && (
                              <span style={{ fontSize: '11px', color: 'var(--muted)', background: 'var(--surface-muted)', padding: '1px 7px', borderRadius: '4px', border: '1px solid var(--border)' }} title="الاسم الرسمي الكامل">
                                📋 {emp.name}
                              </span>
                            )}
                            <span className="code-badge">كود: {emp.code}</span>
                            {emp.devices && emp.devices.some((d) => d.status === 'pending') && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  width: '10px',
                                  height: '10px',
                                  backgroundColor: '#ef4444',
                                  borderRadius: '50%',
                                  boxShadow: '0 0 0 4px #fee2e2'
                                }}
                                title="يوجد طلب اعتماد جهاز قيد الانتظار"
                              ></span>
                            )}
                          </div>
                          <span style={{ color: 'var(--muted)', fontSize: '13px', display: 'block' }}>
                            {emp.jobTitle} {emp.department ? ` · قسم: ${emp.department}` : ''} {emp.phone ? ` · 📞 ${emp.phone}` : ''}
                          </span>
                          {resStatusBadge}
                        </div>
                      </div>

                      {/* Middle Block: Live Punch Clock Status (Only for active tab) */}
                      {!isEmpTerminated ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '220px' }}>
                          <span className={`dot ${active ? (active.isPaused ? 'paused' : 'live') : ''}`}></span>
                          <div>
                            <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'var(--text)' }}>
                              {active ? getActiveElapsedStr(emp.id) : 'لا توجد وردية نشطة الآن'}
                            </div>
                            <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                              {active ? (
                                active.isPaused ? (
                                  <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                                    موقفة مؤقتاً (بريك: {getActiveBreakStr(emp.id)})
                                  </span>
                                ) : (
                                  `جارية منذ ${active.timeIn}${getActiveBreakStr(emp.id) ? ` · (بريك: ${getActiveBreakStr(emp.id)})` : ''}`
                                )
                              ) : (
                                'تتم البصمة من بوابة الحضور / الكشك'
                              )}
                            </div>
                          </div>

                          {active && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {active.isPaused ? (
                                <button className="btn btn-resume" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => resumeShift(emp.id)}>
                                  استئناف
                                </button>
                              ) : (
                                <button className="btn btn-pause" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => pauseShift(emp.id)}>
                                  بريك
                                </button>
                              )}
                              <button className="btn btn-stop" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => stopShift(emp.id)}>
                                إنهاء
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Middle Block for Resigned: Archive Summary snippet */
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: '#64748b', flexWrap: 'wrap' }}>
                          <span style={{ background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                            📁 تاريخ الإنهاء: <strong>{emp.terminationDate || emp.resignationDate || '—'}</strong>
                          </span>
                          {emp.signedClearanceDoc && (
                            <span
                              onClick={() => {
                                setDossierInitialTab('settlement');
                                setDossierModalEmp(emp);
                              }}
                              style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              title="اضغط لفتح ومعاينة إخلاء الطرف الموقع"
                            >
                              <span>🟢</span> إخلاء طرف موقع
                            </span>
                          )}
                        </div>
                      )}

                      {/* Right-Middle Block: Financial Summary */}
                      {!isEmpTerminated && (() => {
                        const bdObj = emp.branchesDetails?.find((b) => String(b.branchId) === String(branchKey));
                        const branchHourlyRate = bdObj ? parseFloat(bdObj.salary) || 0 : (parseFloat(emp.salary) || 0);
                        const branchSum = empSum.perBranch?.[branchKey] || empSum;
                        const branchMonthlySalary = branchSum.monthlySalary || (branchHourlyRate * (parseFloat(bdObj?.workHoursPerDay) || 8) * (parseFloat(bdObj?.workDaysPerMonth) || 26));
                        return (
                          <div style={{ display: 'flex', gap: '16px', fontSize: '13px', background: 'var(--surface)', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                            <div>سعر الساعة: <strong style={{ color: 'var(--primary-dark)' }}>{fmt(branchHourlyRate)} ج.م</strong></div>
                            <div>الراتب الأساسي: <strong style={{ color: 'var(--primary-dark)' }}>{fmt(branchMonthlySalary)} ج.م</strong></div>
                            <div>الساعات: <strong>{fmt(branchSum.hours)} س</strong></div>
                            <div>الصافي: <strong style={{ color: '#0d9488' }}>{fmt(branchSum.baseEarnings || empSum.netSalary)} ج.م</strong></div>
                          </div>
                        );
                      })()}

                      {/* Action Buttons Group */}
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* 1. If Active: End of Service Button */}
                        {!isEmpTerminated ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setTerminationModalEmp(emp)}
                            title="إنهاء الخدمة النهائي وتصفية الحساب"
                            style={{
                              background: '#fef2f2',
                              color: '#991b1b',
                              border: '1px solid #fecaca',
                              fontWeight: 'bold',
                              fontSize: '12px',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <span>🛑</span> إنهاء الخدمة النهائي
                          </button>
                        ) : (
                          /* 2. If Resigned: Rehire & Dossier Buttons */
                          <>
                            <button
                              type="button"
                              className="btn btn-start"
                              onClick={() => {
                                setRehireModalEmp(emp);
                                setRehireBranchId(emp.branchId || 'main');
                              }}
                              title="إعادة الموظف على رأس العمل"
                              style={{
                                background: '#059669',
                                color: '#fff',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <span>🔄</span> إعادة للعمل
                            </button>

                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => {
                                setDossierInitialTab('settlement');
                                setDossierModalEmp(emp);
                              }}
                              title="فتح صفحة المخالصة المالية وإخلاء الطرف"
                              style={{
                                background: '#fef3c7',
                                color: '#92400e',
                                border: '1px solid #fde68a',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <span>📥</span> إخلاء الطرف
                            </button>

                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => {
                                setDossierInitialTab('summary');
                                setDossierModalEmp(emp);
                              }}
                              title="فتح السجل الشامل لجميع بيانات وسجلات الموظف"
                              style={{
                                background: '#e0f2fe',
                                color: '#0369a1',
                                border: '1px solid #bae6fd',
                                fontWeight: 'bold',
                                fontSize: '12px',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <span>📄</span> السجل الشامل
                            </button>

                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => setTerminationModalEmp(emp)}
                              title="إعادة معاينة وطباعة المخالصة المالية"
                            >
                              🖨️
                            </button>
                          </>
                        )}

                        {emp.driveFolderUrl && (
                          <a
                            href={emp.driveFolderUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="icon-btn"
                            title="فتح مجلد Google Drive للموظف"
                            style={{
                              background: '#eff6ff',
                              borderColor: '#bfdbfe',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            📁
                          </a>
                        )}
                        <button className="icon-btn" title="بطاقة الموظف والـ QR" onClick={() => openEmpCard(emp)}>
                          🪪 QR
                        </button>
                        <button className="icon-btn" title="تعديل بيانات الموظف" onClick={() => openEditEmpModal(emp)}>
                          ✏️
                        </button>
                        <button className="icon-btn danger" title="حذف الموظف نهائياً" onClick={() => handleDeleteEmp(emp.id)}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MODAL 1: TERMINATION & FINANCIAL SETTLEMENT ── */}
      {terminationModalEmp && (
        <EmployeeTerminationModal
          emp={terminationModalEmp}
          state={state}
          onClose={() => setTerminationModalEmp(null)}
          onConfirmTermination={handleConfirmTermination}
        />
      )}

      {/* ── MODAL 2: COMPREHENSIVE DOSSIER MODAL ── */}
      {dossierModalEmp && (
        <EmployeeComprehensiveDossierModal
          emp={dossierModalEmp}
          state={state}
          initialTab={dossierInitialTab}
          onClose={() => {
            setDossierModalEmp(null);
            setDossierInitialTab('summary');
          }}
          onSaveSignedClearance={handleSaveSignedClearance}
          onOpenRehireModal={(emp) => {
            setDossierModalEmp(null);
            setRehireModalEmp(emp);
            setRehireBranchId(emp.branchId || 'main');
          }}
          onOpenEditModal={(emp) => {
            setDossierModalEmp(null);
            openEditEmpModal(emp);
          }}
          onOpenIDCardModal={(emp) => {
            setDossierModalEmp(null);
            openEmpCard(emp);
          }}
        />
      )}

      {/* ── MODAL 3: REHIRE / REINSTATE CONFIRMATION MODAL ── */}
      {rehireModalEmp && (
        <div className="modal-backdrop" style={{ zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: '520px', width: '92%', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#059669', fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🔄 إعادة الموظف على رأس العمل
              </h3>
              <button className="del-btn" onClick={() => setRehireModalEmp(null)} disabled={isRehiring}>✕</button>
            </div>

            <form onSubmit={handleConfirmRehire}>
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', color: '#166534', fontSize: '13px' }}>
                هل تريد إعادة الموظف <strong>{rehireModalEmp.name} ({rehireModalEmp.code})</strong> إلى الخدمة وعلى رأس العمل؟
                <div style={{ fontSize: '12px', color: '#15803d', marginTop: '4px' }}>
                  ⭐ سيعود الموظف لكافة سجلاته السابقة (البصمات، الورديات، الرواتب، الأذونات، والتقييمات) مع تفعيل حسابه وبصمته فوراً.
                </div>
              </div>

              <div className="field" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>تاريخ مباشرة العمل / العودة *</label>
                <input
                  type="date"
                  value={rehireDate}
                  onChange={(e) => setRehireDate(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                />
              </div>

              <div className="field" style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>الفرع المسند إليه *</label>
                <select
                  value={rehireBranchId}
                  onChange={(e) => setRehireBranchId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
                >
                  <option value="main">المركز الرئيسي / عام</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 'bold' }}>ملاحظات وتفاصيل إعادة التعيين</label>
                <textarea
                  rows={2}
                  placeholder="ملاحظات قرار المباشرة والعودة..."
                  value={rehireNotes}
                  onChange={(e) => setRehireNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setRehireModalEmp(null)} disabled={isRehiring}>
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="btn btn-start"
                  style={{ background: '#059669', color: '#fff', fontWeight: 'bold', padding: '8px 20px' }}
                  disabled={isRehiring}
                >
                  {isRehiring ? '⏳ جاري الحفظ...' : '✅ تأكيد العودة على رأس العمل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Employee Photo Preview Lightbox Modal ── */}
      {previewPhotoEmp && (
        <div
          className="modal-backdrop"
          style={{
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            padding: '20px'
          }}
          onClick={() => setPreviewPhotoEmp(null)}
        >
          <div
            className="modal-content"
            style={{
              maxWidth: '480px',
              width: '100%',
              background: 'var(--surface)',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              border: '1px solid var(--border)',
              animation: 'scaleUp 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 18px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-muted)'
            }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
                  👤 {getEmpDisplayName(previewPhotoEmp)}
                </h4>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  كود: {previewPhotoEmp.code} · {previewPhotoEmp.jobTitle || 'موظف'}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPreviewPhotoEmp(null)}
                style={{ fontSize: '16px', padding: '4px 10px', borderRadius: '8px' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '16px', textAlign: 'center', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '260px' }}>
              <img
                src={previewPhotoEmp.photoUrl || previewPhotoEmp.photo}
                alt={getEmpDisplayName(previewPhotoEmp)}
                style={{
                  maxWidth: '100%',
                  maxHeight: '420px',
                  objectFit: 'contain',
                  borderRadius: '12px'
                }}
              />
            </div>

            <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                📍 {getBranchName(previewPhotoEmp.branchId)}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPreviewPhotoEmp(null)}
                style={{ fontSize: '12.5px', fontWeight: 'bold' }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
