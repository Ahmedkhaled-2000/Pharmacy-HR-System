import React, { useState, useEffect } from 'react';
import EmployeeCardsGrid from './EmployeeCardsGrid';
import AttendanceModule from '../attendance/AttendanceModule';
import ElectronicAttendanceAdmin from '../attendance/ElectronicAttendanceAdmin';
import RosterModule from '../roster/RosterModule';
import JobsDepartmentsModule from './JobsDepartmentsModule';
import EmploymentContractModule from './EmploymentContractModule';

export default function EmployeesHubModule({
  subTab = 'cards',
  onSubTabChange,
  state,
  setState,
  saveState,
  showToast,
  monthPicker,
  setMonthPicker,
  filterMode,
  setFilterMode,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  filterFn,
  computeEmpSummary,
  openEmpCard,
  openEditEmpModal,
  handleDeleteEmp,
  getActiveElapsedStr,
  getActiveBreakStr,
  startShift,
  pauseShift,
  resumeShift,
  stopShift,
  setInspectedEmp,
  sendWhatsAppMsg,
  generatePayslipMsg,
  importEmployeesFromExcel,
  exportEmployeesToExcel,
  openAddEmpModal,
  openEmpPhonesModal,
  setIsEmpPhonesModalOpen,
  setEditingEmpFile,
  setIsEmpFileModalOpen,
  executeWithOwnerGuard
}) {
  const [currentSubTab, setCurrentSubTab] = useState(subTab || 'cards');

  // Synchronize when parent passes subTab from Top Menu
  useEffect(() => {
    if (subTab && subTab !== currentSubTab) {
      setCurrentSubTab(subTab);
    }
  }, [subTab]);

  const handleTabClick = (tabId) => {
    setCurrentSubTab(tabId);
    if (onSubTabChange) {
      onSubTabChange(tabId);
    }
  };

  const tabs = [
    { id: 'cards', label: '👥 دليل وبطاقات الموظفين', count: (state.employees || []).length },
    { id: 'attendance', label: '⏱️ سجل الحضور والانصراف والبصمات' },
    { id: 'biometrics', label: '📸 البصمة الإلكترونية الحيوية (الوجه واليد)' },
    { id: 'roster', label: '📅 الجداول والورديات الشهرية' }
  ];

  return (
    <div className="employees-hub-container fade-in" style={{ width: '100%' }}>
      {/* ── Sub-tab 1: Employees Cards Grid ── */}
      {currentSubTab === 'cards' && (
        <EmployeeCardsGrid
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          monthPicker={monthPicker}
          filterFn={filterFn}
          computeEmpSummary={computeEmpSummary}
          openEmpCard={openEmpCard}
          openEditEmpModal={openEditEmpModal}
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
          importEmployeesFromExcel={importEmployeesFromExcel}
          exportEmployeesToExcel={exportEmployeesToExcel}
          openAddEmpModal={openAddEmpModal}
          openEmpPhonesModal={openEmpPhonesModal}
        />
      )}

      {/* ── Sub-tab 2: Attendance & Punches Module ── */}
      {currentSubTab === 'attendance' && (
        <AttendanceModule
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          filterFn={filterFn}
          monthPicker={monthPicker}
          filterMode={filterMode}
          customFrom={customFrom}
          customTo={customTo}
          executeWithOwnerGuard={executeWithOwnerGuard}
        />
      )}

      {/* ── Sub-tab 3: Electronic Biometrics Module ── */}
      {currentSubTab === 'biometrics' && (
        <ElectronicAttendanceAdmin
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          executeWithOwnerGuard={executeWithOwnerGuard}
        />
      )}

      {/* ── Sub-tab 4: Monthly Rosters Module ── */}
      {currentSubTab === 'roster' && (
        <RosterModule
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
        />
      )}

      {/* ── Sub-tab 5: Jobs & Departments Module ── */}
      {currentSubTab === 'jobs' && (
        <JobsDepartmentsModule
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          executeWithOwnerGuard={executeWithOwnerGuard}
        />
      )}

      {/* ── Sub-tab 6: Employment Contract Module ── */}
      {currentSubTab === 'contracts' && (
        <EmploymentContractModule
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
          executeWithOwnerGuard={executeWithOwnerGuard}
        />
      )}
    </div>
  );
}
