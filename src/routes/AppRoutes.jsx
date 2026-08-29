import React, { Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';

import ErrorBoundary from '../components/common/ErrorBoundary';
import LoginPage from '../components/auth/LoginPage';
import EmployeePortalView from '../components/employee-portal/EmployeePortalView';
import DesktopLayout from '../components/layout/DesktopLayout';
import BranchManagerView from '../components/branch-manager/BranchManagerView';
import Dashboard from '../components/dashboard/Dashboard';
import EmployeesHubModule from '../components/employees/EmployeesHubModule';
import BranchManagementModule from '../components/branches/BranchManagementModule';
import RequestsModule from '../components/requests/RequestsModule';
import LeavesTrackingModule from '../components/leaves/LeavesTrackingModule';
import EmployeePermissionsManagementModule from '../components/permissions/EmployeePermissionsManagementModule';
import PayrollModule from '../components/payroll/PayrollModule';
import AdjustmentsModule from '../components/adjustments/AdjustmentsModule';
import WhatsAppCenterModule from '../components/whatsapp/WhatsAppCenterModule';
import BylawsModule from '../components/bylaws/BylawsModule';
import AdminResignationModule from '../components/resignation/AdminResignationModule';
import EvaluationsModule from '../components/evaluations/EvaluationsModule';
import LoansMedsModule from '../components/loans/LoansMedsModule';
import IncomeExpensesModule from '../components/finance/IncomeExpensesModule';
import SettingsModule from '../components/settings/SettingsModule';
import NotificationCenterModule from '../components/notifications/NotificationCenterModule';
import ApprovalCenterModule from '../components/approvals/ApprovalCenterModule';

// Lazy Loaded Independent Systems (Code-Splitting for Lightning Speed)
const ArchiveSystemView = lazy(() => import('../components/archive/ArchiveSystemView'));
const PublicCandidateApplyPortal = lazy(() => import('../components/recruitment/PublicCandidateApplyPortal'));
const InterviewerEvaluationPortal = lazy(() => import('../components/recruitment/InterviewerEvaluationPortal'));
const ElectronicKioskView = lazy(() => import('../components/kiosk/ElectronicKioskView'));

import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { useNotifications } from '../context/NotificationContext';
import { useAttendanceEngine } from '../hooks/useAttendanceEngine';
import { useRequestsManager } from '../hooks/useRequestsManager';
import { useExcelOperations } from '../hooks/useExcelOperations';
import { useDailyDigestCron } from '../hooks/useDailyDigestCron';
import { getJobsList, getDepartmentsList } from '../utils/jobsHelper';
import { arabicMonthLabel, fmt } from '../utils/formatters';

export default function AppRoutes() {
  const location = useLocation();

  const {
    themeMode,
    toggleTheme,
    authRole,
    currentBranch,
    currentEmpUser,
    setCurrentEmpUser,
    activeNavTab,
    setActiveNavTab,
    activeSubTab,
    setActiveSubTab,
    isAdminLoggedIn,
    handleUnifiedLogin,
    handleEmpLogin,
    handleLogout
  } = useAuth();

  const {
    state,
    setState,
    saveState,
    isLoading,
    getEmp,
    getEmpPermission,
    computeEmpSummary,
    computeGrandPayroll
  } = useData();

  const {
    showToast,
    adminFilterMode,
    setAdminFilterMode,
    monthPicker,
    setMonthPicker,
    adminCustomFrom,
    setAdminCustomFrom,
    adminCustomTo,
    setAdminCustomTo,
    currentFilterFn,
    executeWithOwnerGuard,
    openEmpCard,
    openEditShift,
    setInspectedEmp,
    openEmpFileModal,
    openEmpPhonesModal,
    setEditingEmpFile,
    setIsEmpFileModalOpen
  } = useUI();

  const {
    pendingRequestsCount,
    bylawsCount,
    notifications,
    handleMarkNotificationRead,
    handleMarkAllNotificationsRead,
    handleDeleteNotification,
    handleClearReadNotifications
  } = useNotifications();

  const {
    getActiveElapsedStr,
    getActiveBreakStr,
    startShift,
    pauseShift,
    resumeShift,
    stopShift,
    deleteShift,
    handleDeleteEmp,
    handleKioskDeviceRequest
  } = useAttendanceEngine();

  const {
    handleApproveRequest,
    handleRejectRequest,
    handleSendEarlyExitEmail,
    handleWaiveEarlyExit,
    handleSaveApprovalRules
  } = useRequestsManager();

  const {
    exportEmpExcel,
    exportAllPayrollExcel,
    handleExcelImport
  } = useExcelOperations();

  // Run 23:59 Daily Digest Background Automated Cron
  useDailyDigestCron();

  // Navigation mode via URL
  const viewMode = location.pathname.startsWith('/careers')
    ? 'careers'
    : location.pathname.startsWith('/interview')
    ? 'interview'
    : location.pathname.startsWith('/archive')
    ? 'archive'
    : location.pathname.startsWith('/kiosk')
    ? 'kiosk'
    : location.pathname === '/employee'
    ? 'employee'
    : 'admin';

  const kioskBranchId = location.pathname.startsWith('/kiosk/') ? location.pathname.split('/')[2] : null;

  // Domain Handlers
  const handleSaveBranch = async (branchData) => {
    const currentBranches = state.branches || [];
    const exists = currentBranches.some((b) => b.id === branchData.id);

    if (branchData.username && String(branchData.username).trim()) {
      const cleanUsername = String(branchData.username).trim().toLowerCase();
      const duplicateBranch = currentBranches.find(
        (b) => b.id !== branchData.id && (b.username && String(b.username).trim().toLowerCase() === cleanUsername)
      );
      if (duplicateBranch) {
        showToast(`⚠️ خطأ: اسم المستخدم (${branchData.username}) مستخدم بالفعل لفرع "${duplicateBranch.name}"!`);
        return;
      }
      const duplicateEmp = (state.employees || []).find(
        (e) => (e.code && String(e.code).trim().toLowerCase() === cleanUsername) ||
               (e.username && String(e.username).trim().toLowerCase() === cleanUsername)
      );
      if (duplicateEmp) {
        showToast(`⚠️ خطأ: اسم المستخدم (${branchData.username}) مستخدم بالفعل ككود للموظف "${duplicateEmp.name}" (كود: ${duplicateEmp.code})!`);
        return;
      }
    }

    const performSaveBranch = async () => {
      let updatedBranches;
      if (exists) {
        updatedBranches = currentBranches.map((b) => (b.id === branchData.id ? branchData : b));
      } else {
        updatedBranches = [...currentBranches, branchData];
      }
      const updatedState = { ...state, branches: updatedBranches };
      setState(updatedState);
      await saveState(updatedState);
      showToast('✅ تم حفظ بيانات الفرع بنجاح');
    };

    executeWithOwnerGuard({
      lockKey: 'lockManageBranches',
      actionTitle: exists ? `تعديل بيانات فرع (${branchData.name})` : `إضافة فرع جديد (${branchData.name})`,
      actionDetails: `اسم الفرع: ${branchData.name} · الكود: ${branchData.code || '—'}`,
      onExecute: performSaveBranch
    });
  };

  const handleDeleteBranch = async (branchId) => {
    const branch = (state.branches || []).find((b) => b.id === branchId);
    const performDeleteBranch = async () => {
      const updatedBranches = (state.branches || []).filter((b) => b.id !== branchId);
      const updatedDeletedIds = Array.from(new Set([...(state._deletedIds || []), String(branchId), `branch_${branchId}`])).slice(-2000);
      const updatedState = { ...state, branches: updatedBranches, _deletedIds: updatedDeletedIds };
      setState(updatedState);
      await saveState(updatedState);
      showToast('🗑️ تم حذف الفرع نهائياً');
    };

    executeWithOwnerGuard({
      lockKey: 'lockManageBranches',
      actionTitle: `حذف فرع (${branch?.name || branchId})`,
      actionDetails: 'حذف الفرع نهائياً من قاعدة البيانات',
      onExecute: performDeleteBranch
    });
  };

  const handleSaveEvaluation = async (evalData) => {
    const updatedState = {
      ...state,
      evaluations: [...(state.evaluations || []), evalData]
    };
    setState(updatedState);
    await saveState(updatedState);
    showToast('⭐ تم حفظ التقييم الدوري بنجاح');
  };

  const handleSaveEmployeeNote = async (noteData) => {
    const updatedState = {
      ...state,
      employeeNotes: [...(state.employeeNotes || []), noteData]
    };
    setState(updatedState);
    await saveState(updatedState);
    showToast('📝 تم حفظ الملاحظة بنجاح');
  };

  const handleReplyToNote = async (noteId, replyData) => {
    const updatedNotes = (state.employeeNotes || []).map((n) => {
      if (n.id === noteId) {
        return { ...n, replies: [...(n.replies || []), replyData] };
      }
      return n;
    });
    const updatedState = { ...state, employeeNotes: updatedNotes };
    setState(updatedState);
    await saveState(updatedState);
    showToast('💬 تم إرسال الرد بنجاح');
  };

  const handleApproveLoan = async (loanId) => {
    handleApproveRequest(loanId, 'admin');
  };

  const handleRejectLoan = async (loanId) => {
    handleRejectRequest(loanId, 'admin');
  };

  const sendWhatsAppMsg = (empId, text) => {
    const emp = getEmp(empId);
    if (!emp) return;
    if (!emp.phone || !emp.phone.trim()) {
      showToast('❌ لا يوجد رقم هاتف مسجل لهذا الموظف');
      return;
    }
    let cleanPhone = emp.phone.trim().replace(/\D/g, '');
    if (cleanPhone.startsWith('01')) cleanPhone = '2' + cleanPhone;

    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
    showToast(`جاري فتح WhatsApp لمراسلة ${emp.name}...`);
  };

  const generatePayslipMsg = (empId, targetMonth = monthPicker) => {
    const emp = getEmp(empId);
    if (!emp) return '';
    const summary = computeEmpSummary(empId, (d) => d.startsWith(targetMonth), targetMonth);
    const monthLabel = arabicMonthLabel(targetMonth);
    const orgName = state.orgSettings?.orgName || 'المؤسسة';

    return `السلام عليكم ورحمة الله وبركاته،\n\nعزيزي الموظف: ${emp.name} (كود: ${emp.code})\nإليك تفاصيل مرتب شهر ${monthLabel}:\n\n• ساعات العمل المسجلة: ${fmt(summary.hours)} ساعة\n• المستحقات الأساسية: ${fmt(summary.baseEarnings)} ج.م\n• إجمالي المكافآت (+): ${fmt(summary.totalBonus)} ج.م\n• إجمالي الخصومات (-): ${fmt(summary.totalDeduction)} ج.م\n-----------------------------------------\n★ صافي المرتب المستحق: ${fmt(summary.netSalary)} ج.م\n\nمع تحيات إدارة ${orgName}.`;
  };

  return (
    <div className={`mode-${viewMode}`}>
      {/* 0. Initial Loading Spinner with Organization Logo */}
      {isLoading && (() => {
        const effectiveLogo = state?.orgSettings?.logoUrl ||
          (() => {
            try {
              const saved = localStorage.getItem('pharmacy-tracker-data');
              if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed?.orgSettings?.logoUrl) return parsed.orgSettings.logoUrl;
              }
            } catch {}
            return '/icons/logo_512x512.png';
          })();

        const effectiveOrgName = state?.orgSettings?.orgName ||
          (() => {
            try {
              const saved = localStorage.getItem('pharmacy-tracker-data');
              if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed?.orgSettings?.orgName) return parsed.orgSettings.orgName;
              }
            } catch {}
            return 'منظومة إدارة الموارد البشرية والرواتب';
          })();

        return (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'linear-gradient(135deg, #0f172a 0%, #134e4a 50%, #064e3b 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            color: '#ffffff',
            fontFamily: "'Cairo', 'Tajawal', sans-serif",
            direction: 'rtl'
          }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              borderRadius: '24px',
              padding: '40px 48px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 24px 50px rgba(0, 0, 0, 0.35)',
              maxWidth: '90%',
              textAlign: 'center',
              animation: 'fadeIn 0.3s ease-out'
            }}>
              {/* Organization Logo Card */}
              <div style={{
                marginBottom: '20px',
                background: '#ffffff',
                padding: '10px 20px',
                borderRadius: '18px',
                boxShadow: '0 10px 28px rgba(0, 0, 0, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <img
                  src={effectiveLogo}
                  alt={effectiveOrgName}
                  style={{
                    maxHeight: '75px',
                    maxWidth: 'min(220px, 70vw)',
                    objectFit: 'contain',
                    display: 'block'
                  }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '/icons/logo_512x512.png';
                  }}
                />
              </div>

              <div className="spinner" style={{
                width: '42px',
                height: '42px',
                borderWidth: '3.5px',
                borderColor: 'rgba(255,255,255,0.2)',
                borderTopColor: '#38bdf8',
                marginBottom: '18px'
              }}></div>

              <h2 style={{ margin: '0 0 8px', fontSize: '21px', fontWeight: '800', color: '#ffffff' }}>
                {effectiveOrgName}
              </h2>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#94a3b8' }}>
                جاري الاتصال بقاعدة البيانات ومزامنة السجلات الحية...
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── 1. Standalone Systems ── */}
      {viewMode === 'archive' && (
        <ErrorBoundary fallbackTitle="حدث خطأ في نظام أرشيف الصيدلية">
          <Suspense fallback={<div className="loading-fallback">جاري تحميل الأرشيف...</div>}>
            <ArchiveSystemView isStandalone={true} />
          </Suspense>
        </ErrorBoundary>
      )}

      {viewMode === 'careers' && (
        <ErrorBoundary fallbackTitle="حدث خطأ في بوابة التوظيف">
          <Suspense fallback={<div className="loading-fallback">جاري تحميل بوابة التوظيف...</div>}>
            <PublicCandidateApplyPortal state={state} setState={setState} saveState={saveState} showToast={showToast} />
          </Suspense>
        </ErrorBoundary>
      )}

      {viewMode === 'interview' && (
        <ErrorBoundary fallbackTitle="حدث خطأ في تقييم المقابلات">
          <Suspense fallback={<div className="loading-fallback">جاري تحميل شاشة المقابلات...</div>}>
            <InterviewerEvaluationPortal state={state} setState={setState} saveState={saveState} showToast={showToast} />
          </Suspense>
        </ErrorBoundary>
      )}

      {viewMode === 'kiosk' && (
        <ErrorBoundary fallbackTitle="حدث خطأ في كشك البصمة والحضور">
          <Suspense fallback={<div className="loading-fallback">جاري تحميل كشك البصمة...</div>}>
            <ElectronicKioskView
              orgSettings={state.orgSettings}
              state={state}
              startShift={startShift}
              pauseShift={pauseShift}
              resumeShift={resumeShift}
              stopShift={stopShift}
              onKioskDeviceRequest={handleKioskDeviceRequest}
              kioskBranchId={kioskBranchId}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* ── 2. Authenticated / Unauthenticated App Views ── */}
      {viewMode !== 'kiosk' && viewMode !== 'archive' && viewMode !== 'careers' && viewMode !== 'interview' && (
        (!isAdminLoggedIn && !currentEmpUser && !currentBranch) || authRole === 'none' ? (
          <ErrorBoundary fallbackTitle="حدث خطأ في شاشة تسجيل الدخول">
            <LoginPage
              onLogin={handleUnifiedLogin}
              state={state}
              themeMode={themeMode}
              toggleTheme={toggleTheme}
            />
          </ErrorBoundary>
        ) : (authRole === 'employee' && currentEmpUser) ? (
          <ErrorBoundary fallbackTitle="حدث خطأ في عرض بوابة الموظف">
            <EmployeePortalView
              currentEmpUser={currentEmpUser}
              setCurrentEmpUser={setCurrentEmpUser}
              handleEmpLogin={handleEmpLogin}
              state={state}
              setState={setState}
              saveState={saveState}
              computeEmpSummary={computeEmpSummary}
              getEmpPermission={getEmpPermission}
              showToast={showToast}
              orgSettings={state.orgSettings}
              startShift={startShift}
              pauseShift={pauseShift}
              resumeShift={resumeShift}
              stopShift={stopShift}
              getActiveElapsedStr={getActiveElapsedStr}
              getActiveBreakStr={getActiveBreakStr}
              openEditShift={openEditShift}
              handleLogout={handleLogout}
              deleteShift={deleteShift}
              themeMode={themeMode}
              toggleTheme={toggleTheme}
              notifications={state.notifications || []}
              onMarkNotificationRead={handleMarkNotificationRead}
              onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
              onDeleteNotification={handleDeleteNotification}
              onClearReadNotifications={handleClearReadNotifications}
            />
          </ErrorBoundary>
        ) : (
          <DesktopLayout
            currentRole={authRole}
            currentBranch={currentBranch}
            notifications={notifications}
            onMarkNotificationRead={handleMarkNotificationRead}
            onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
            onDeleteNotification={handleDeleteNotification}
            onClearReadNotifications={handleClearReadNotifications}
            userProfile={
              authRole === 'owner'
                ? { name: 'المالك (Owner)', jobTitle: 'مالك المنظومة والمشرف العام', code: 'OWNER', isOwner: true }
                : authRole === 'branch'
                ? {
                    name: (state.employees || []).find((e) => e.id === currentBranch?.managerId)?.name || (currentBranch?.name ? `مدير فرع ${currentBranch.name}` : 'مدير الفرع'),
                    jobTitle: (state.employees || []).find((e) => e.id === currentBranch?.managerId)?.jobTitle || 'مدير فرع',
                    code: (state.employees || []).find((e) => e.id === currentBranch?.managerId)?.code || 'MGR',
                    photoUrl: (state.employees || []).find((e) => e.id === currentBranch?.managerId)?.photoUrl || ''
                  }
                : { name: 'الإدارة العليا', jobTitle: 'Super Admin', code: 'ADMIN' }
            }
            activeTab={activeNavTab}
            setActiveTab={setActiveNavTab}
            activeSubTab={activeSubTab}
            setActiveSubTab={setActiveSubTab}
            onLogout={handleLogout}
            pendingCount={pendingRequestsCount}
            bylawsCount={bylawsCount}
            themeMode={themeMode}
            toggleTheme={toggleTheme}
            adminFilterMode={adminFilterMode}
            setAdminFilterMode={setAdminFilterMode}
            monthPicker={monthPicker}
            setMonthPicker={setMonthPicker}
            adminCustomFrom={adminCustomFrom}
            setAdminCustomFrom={setAdminCustomFrom}
            adminCustomTo={adminCustomTo}
            setAdminCustomTo={setAdminCustomTo}
            onExportExcel={
              authRole === 'branch'
                ? () => {
                    const mgrEmp = (state.employees || []).find((e) => e.id === currentBranch?.managerId) || (state.employees || []).find((e) => e.branchId === currentBranch?.id);
                    if (mgrEmp) exportEmpExcel(mgrEmp.id, 'month');
                    else exportAllPayrollExcel();
                  }
                : undefined
            }
          >
            {authRole === 'branch' ? (
              <ErrorBoundary fallbackTitle="حدث خطأ في عرض لوحة مدير الفرع">
                <BranchManagerView
                  state={state}
                  setState={setState}
                  saveState={saveState}
                  currentBranch={currentBranch}
                  activeTab={activeNavTab}
                  setActiveTab={setActiveNavTab}
                  showToast={showToast}
                  startShift={startShift}
                  pauseShift={pauseShift}
                  resumeShift={resumeShift}
                  stopShift={stopShift}
                  monthPicker={monthPicker}
                  setMonthPicker={setMonthPicker}
                  filterMode={adminFilterMode}
                  setFilterMode={setAdminFilterMode}
                  customFrom={adminCustomFrom}
                  setCustomFrom={setAdminCustomFrom}
                  customTo={adminCustomTo}
                  setCustomTo={setAdminCustomTo}
                  filterFn={currentFilterFn}
                  getEmpPermission={getEmpPermission}
                  onExportExcel={() => {
                    const mgrEmp = (state.employees || []).find((e) => e.id === currentBranch?.managerId) || (state.employees || []).find((e) => e.branchId === currentBranch?.id);
                    if (mgrEmp) exportEmpExcel(mgrEmp.id, 'month');
                    else exportAllPayrollExcel();
                  }}
                />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary fallbackTitle="حدث خطأ في عرض هذا القسم">
                {/* 1. Dashboard */}
                {activeNavTab === 'dashboard' && (
                  <Dashboard
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    monthPicker={monthPicker}
                    setMonthPicker={setMonthPicker}
                    filterMode={adminFilterMode}
                    setFilterMode={setAdminFilterMode}
                    customFrom={adminCustomFrom}
                    setCustomFrom={setAdminCustomFrom}
                    customTo={adminCustomTo}
                    setCustomTo={setAdminCustomTo}
                    filterFn={currentFilterFn}
                    exportAllPayrollExcel={exportAllPayrollExcel}
                    showToast={showToast}
                    onApproveRequest={(reqId) => handleApproveRequest(reqId, 'admin')}
                    onRejectRequest={(reqId) => handleRejectRequest(reqId, 'admin')}
                    onSendEarlyExitEmail={handleSendEarlyExitEmail}
                    onWaiveEarlyExit={handleWaiveEarlyExit}
                  />
                )}

                {/* 2. Employees Hub */}
                {(activeNavTab === 'employees' || activeNavTab === 'attendance' || activeNavTab === 'electronic-attendance' || activeNavTab === 'roster') && (
                  <EmployeesHubModule
                    subTab={
                      activeNavTab === 'attendance'
                        ? 'attendance'
                        : activeNavTab === 'electronic-attendance'
                        ? 'biometrics'
                        : activeNavTab === 'roster'
                        ? 'roster'
                        : activeSubTab
                    }
                    onSubTabChange={(sub) => setActiveSubTab(sub)}
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    monthPicker={monthPicker}
                    setMonthPicker={setMonthPicker}
                    filterMode={adminFilterMode}
                    setFilterMode={setAdminFilterMode}
                    customFrom={adminCustomFrom}
                    setCustomFrom={setAdminCustomFrom}
                    customTo={adminCustomTo}
                    setCustomTo={setAdminCustomTo}
                    filterFn={currentFilterFn}
                    computeEmpSummary={computeEmpSummary}
                    openEmpCard={openEmpCard}
                    openEditEmpModal={(emp) => {
                      setEditingEmpFile(emp);
                      setIsEmpFileModalOpen(true);
                    }}
                    handleDeleteEmp={handleDeleteEmp}
                    getActiveElapsedStr={getActiveElapsedStr}
                    getActiveBreakStr={getActiveBreakStr}
                    startShift={startShift}
                    pauseShift={pauseShift}
                    resumeShift={resumeShift}
                    stopShift={stopShift}
                    setInspectedEmp={setInspectedEmp}
                    sendWhatsAppMsg={sendWhatsAppMsg}
                    generatePayslipMsg={generatePayslipMsg}
                    importEmployeesFromExcel={handleExcelImport}
                    exportEmployeesToExcel={exportAllPayrollExcel}
                    openAddEmpModal={() => {
                      setEditingEmpFile(null);
                      setIsEmpFileModalOpen(true);
                    }}
                    openEmpPhonesModal={openEmpPhonesModal}
                    setIsEmpPhonesModalOpen={openEmpPhonesModal}
                    setEditingEmpFile={setEditingEmpFile}
                    setIsEmpFileModalOpen={setIsEmpFileModalOpen}
                  />
                )}

                {/* 3. Branch Management */}
                {activeNavTab === 'branches' && (
                  <BranchManagementModule
                    state={state}
                    onSaveBranch={handleSaveBranch}
                    onDeleteBranch={handleDeleteBranch}
                  />
                )}

                {/* 4. Requests Center */}
                {activeNavTab === 'requests' && (
                  <RequestsModule
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    startShift={startShift}
                    pauseShift={pauseShift}
                    resumeShift={resumeShift}
                    stopShift={stopShift}
                    filterFn={currentFilterFn}
                    monthPicker={monthPicker}
                    filterMode={adminFilterMode}
                    customFrom={adminCustomFrom}
                    customTo={adminCustomTo}
                    currentBranch={currentBranch}
                    authRole={authRole}
                    currentRole={authRole === 'branch' ? 'branch' : 'admin'}
                    executeWithOwnerGuard={executeWithOwnerGuard}
                  />
                )}

                {/* 5. Leaves Tracking */}
                {activeNavTab === 'leaves-tracking' && (
                  <LeavesTrackingModule
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    filterFn={currentFilterFn}
                    monthPicker={monthPicker}
                    filterMode={adminFilterMode}
                    customFrom={adminCustomFrom}
                    customTo={adminCustomTo}
                  />
                )}

                {/* 6. Employee Permissions Management */}
                {activeNavTab === 'permissions-management' && (
                  <EmployeePermissionsManagementModule
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    currentBranch={currentBranch}
                    authRole={authRole}
                    currentEmployee={null}
                    showToast={showToast}
                    filterFn={currentFilterFn}
                    monthPicker={monthPicker}
                    filterMode={adminFilterMode}
                    customFrom={adminCustomFrom}
                    customTo={adminCustomTo}
                  />
                )}

                {/* 7. Payroll Summary */}
                {activeNavTab === 'payroll' && (
                  <PayrollModule
                    state={{ ...state, computeEmpSummary }}
                    setState={setState}
                    saveState={saveState}
                    monthPicker={monthPicker}
                    setMonthPicker={setMonthPicker}
                    filterMode={adminFilterMode}
                    setFilterMode={setAdminFilterMode}
                    customFrom={adminCustomFrom}
                    setCustomFrom={setAdminCustomFrom}
                    customTo={adminCustomTo}
                    setCustomTo={setAdminCustomTo}
                    filterFn={currentFilterFn}
                    exportAllPayrollExcel={exportAllPayrollExcel}
                    exportEmpExcel={exportEmpExcel}
                    showToast={showToast}
                  />
                )}

                {/* 8. Adjustments & Bonuses/Deductions */}
                {activeNavTab === 'adjustments-module' && (
                  <AdjustmentsModule
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    filterFn={currentFilterFn}
                    monthPicker={monthPicker}
                    filterMode={adminFilterMode}
                    customFrom={adminCustomFrom}
                    customTo={adminCustomTo}
                    executeWithOwnerGuard={executeWithOwnerGuard}
                  />
                )}

                {/* 9. WhatsApp Center */}
                {activeNavTab === 'whatsapp-center' && (
                  <WhatsAppCenterModule
                    state={state}
                    showToast={showToast}
                  />
                )}

                {/* 10. Work Bylaws */}
                {activeNavTab === 'bylaws' && (
                  <BylawsModule
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    userRole={authRole === 'branch' ? 'branch' : 'admin'}
                    activeSubTab={activeSubTab}
                    setActiveSubTab={setActiveSubTab}
                    filterFn={currentFilterFn}
                    monthPicker={monthPicker}
                    filterMode={adminFilterMode}
                    customFrom={adminCustomFrom}
                    customTo={adminCustomTo}
                    executeWithOwnerGuard={executeWithOwnerGuard}
                  />
                )}

                {/* 11. Resignation Module */}
                {activeNavTab === 'resignation' && (
                  <AdminResignationModule
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    executeWithOwnerGuard={executeWithOwnerGuard}
                  />
                )}

                {/* 12. Performance Evaluations */}
                {activeNavTab === 'evaluations' && (
                  <EvaluationsModule
                    subTab={activeSubTab}
                    onSubTabChange={setActiveSubTab}
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    currentRole={authRole === 'branch' ? 'branch' : 'admin'}
                    currentBranchId={currentBranch?.id}
                    onSaveEvaluation={handleSaveEvaluation}
                    onSaveEmployeeNote={handleSaveEmployeeNote}
                    onReplyToNote={handleReplyToNote}
                    showToast={showToast}
                  />
                )}

                {/* 13. Loans & Credit Meds */}
                {activeNavTab === 'loans-meds' && (
                  <LoansMedsModule
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    executeWithOwnerGuard={executeWithOwnerGuard}
                  />
                )}

                {/* 14. Income & Expenses */}
                {activeNavTab === 'income-expenses' && (
                  <IncomeExpensesModule
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    filterFn={currentFilterFn}
                    monthPicker={monthPicker}
                    filterMode={adminFilterMode}
                    customFrom={adminCustomFrom}
                    customTo={adminCustomTo}
                  />
                )}

                {/* 15. System Settings */}
                {activeNavTab === 'settings' && (
                  <SettingsModule
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    authRole={authRole}
                    activeSubTab={activeSubTab}
                    setActiveSubTab={setActiveSubTab}
                    executeWithOwnerGuard={executeWithOwnerGuard}
                  />
                )}

                {/* 16. Notification Center */}
                {activeNavTab === 'notifications' && (
                  <NotificationCenterModule
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    onNavigateTab={setActiveNavTab}
                    onApproveRequest={(id) => handleApproveRequest(id, authRole === 'branch' ? 'branch' : 'admin')}
                    onRejectRequest={(id) => handleRejectRequest(id, authRole === 'branch' ? 'branch' : 'admin')}
                    onApproveLoan={handleApproveLoan}
                    onRejectLoan={handleRejectLoan}
                    onSendEarlyExitEmail={handleSendEarlyExitEmail}
                    onWaiveEarlyExit={handleWaiveEarlyExit}
                    filterFn={currentFilterFn}
                    monthPicker={monthPicker}
                    filterMode={adminFilterMode}
                    customFrom={adminCustomFrom}
                    customTo={adminCustomTo}
                    currentBranch={currentBranch}
                    authRole={authRole}
                  />
                )}

                {/* 17. Dual Approval Rules */}
                {(activeNavTab === 'approval-rules' || activeNavTab === 'approvals') && (
                  <ApprovalCenterModule
                    state={state}
                    setState={setState}
                    saveState={saveState}
                    showToast={showToast}
                    currentRole="admin"
                    currentBranchId={null}
                    onApproveRequest={(reqId) => handleApproveRequest(reqId, 'admin')}
                    onRejectRequest={(reqId) => handleRejectRequest(reqId, 'admin')}
                    onSaveApprovalRules={handleSaveApprovalRules}
                  />
                )}

                {/* 18. Pharmacy Archive System */}
                {activeNavTab === 'pharmacy-archive' && (
                  <ErrorBoundary fallbackTitle="حدث خطأ في نظام أرشيف الصيدلية">
                    <Suspense fallback={<div className="loading-fallback">جاري تحميل الأرشيف...</div>}>
                      <ArchiveSystemView isStandalone={false} />
                    </Suspense>
                  </ErrorBoundary>
                )}

                {/* Fallback for Unknown Tab */}
                {![
                  'dashboard',
                  'employees',
                  'branches',
                  'attendance',
                  'electronic-attendance',
                  'roster',
                  'requests',
                  'leaves-tracking',
                  'payroll',
                  'adjustments-module',
                  'whatsapp-center',
                  'bylaws',
                  'evaluations',
                  'loans-meds',
                  'income-expenses',
                  'pharmacy-archive',
                  'permissions-management',
                  'settings',
                  'notifications',
                  'approval-rules',
                  'approvals',
                  'resignation'
                ].includes(activeNavTab) && (
                  <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '40px 24px',
                    textAlign: 'center',
                    fontFamily: "'Tajawal', 'Cairo', sans-serif"
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
                    <h3 style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: '20px', fontWeight: '800' }}>
                      القسم غير معرّف أو تم نقله
                    </h3>
                    <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '0 0 20px' }}>
                      القسم المطلوب ({activeNavTab}) غير متوفر حالياً. يمكنك العودة إلى لوحة التحكم الرئيسية.
                    </p>
                    <button
                      type="button"
                      className="btn btn-start"
                      onClick={() => setActiveNavTab('dashboard')}
                      style={{ padding: '10px 24px', fontSize: '14px', fontWeight: 'bold' }}
                    >
                      🏠 الانتقال إلى لوحة التحكم الرئيسية
                    </button>
                  </div>
                )}
              </ErrorBoundary>
            )}
          </DesktopLayout>
        )
      )}
    </div>
  );
}
