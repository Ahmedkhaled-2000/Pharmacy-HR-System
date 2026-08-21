import React, { useState, useEffect } from 'react';
import EmployeeCardsGrid from './EmployeeCardsGrid';
import AttendanceModule from '../attendance/AttendanceModule';
import ElectronicAttendanceAdmin from '../attendance/ElectronicAttendanceAdmin';
import RosterModule from '../roster/RosterModule';

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
  setIsEmpFileModalOpen
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
      {/* ── Sub Navigation Tabs Bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '20px',
        padding: '8px 12px',
        background: 'var(--surface)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
      }}>
        {/* Sub-tabs Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {tabs.map((tab) => {
            const isActive = currentSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '10px',
                  border: isActive ? '1px solid var(--primary)' : '1px solid transparent',
                  background: isActive ? 'var(--primary)' : 'var(--surface-muted)',
                  color: isActive ? '#ffffff' : 'var(--text)',
                  fontSize: '13.5px',
                  fontWeight: isActive ? 800 : 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: isActive ? '0 3px 10px rgba(13,148,136,0.25)' : 'none'
                }}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span style={{
                    background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--border)',
                    color: isActive ? '#ffffff' : 'var(--muted)',
                    padding: '2px 7px',
                    borderRadius: '99px',
                    fontSize: '11.5px',
                    fontWeight: 700
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Global Quick Action Buttons inside Employees Hub */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              if (openEmpPhonesModal) openEmpPhonesModal();
              else if (setIsEmpPhonesModalOpen) setIsEmpPhonesModalOpen(true);
            }}
            style={{
              background: 'var(--primary-light)',
              color: 'var(--primary-dark)',
              border: '1px solid var(--primary-tint)',
              fontWeight: 800,
              fontSize: '13px',
              padding: '7px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>📞</span> دليل هواتف الموظفين
          </button>

          <button
            type="button"
            className="btn btn-start"
            onClick={() => {
              if (openAddEmpModal) openAddEmpModal();
              else {
                if (setEditingEmpFile) setEditingEmpFile(null);
                if (setIsEmpFileModalOpen) setIsEmpFileModalOpen(true);
              }
            }}
            style={{
              fontWeight: 800,
              fontSize: '13px',
              padding: '7px 16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>👤</span> إضافة ملف موظف جديد
          </button>
        </div>
      </div>

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
        />
      )}

      {/* ── Sub-tab 3: Electronic Biometrics Module ── */}
      {currentSubTab === 'biometrics' && (
        <ElectronicAttendanceAdmin
          state={state}
          setState={setState}
          saveState={saveState}
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
    </div>
  );
}
