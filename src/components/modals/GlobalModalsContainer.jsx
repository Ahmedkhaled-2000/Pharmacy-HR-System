import React, { useState, useEffect } from 'react';
import { fmt, arabicWeekday, parseArabicFloat, uid } from '../../utils/formatters';
import { getRealTodayStr } from '../../utils/timeEngine';
import { compressImage } from '../../utils/imageCompressor';
import { syncNow } from '../../utils/offlineSync';
import { smartMergeStates } from '../../utils/stateMerger';
import { normalizeState } from '../../utils/formatters';
import { getEffectiveShiftHours } from '../../utils/latePenaltyEngine';
import { syncEmployeeEntireDrive } from '../../utils/googleDriveService';

import EmployeeModal from '../employees/EmployeeModal';
import EmployeeIDCardModal from '../employees/EmployeeIDCardModal';
import EmployeeFileModal from '../employees/EmployeeFileModal';
import EmployeePhonesDirectoryModal from '../employees/EmployeePhonesDirectoryModal';
import EditShiftModal from '../shifts/EditShiftModal';
import ExportPayrollModal from '../payroll/ExportPayrollModal';
import KioskConfirmModal from '../kiosk/KioskConfirmModal';
import OwnerOverrideModal from '../common/OwnerOverrideModal';
import OfflineStateOverlay from '../common/OfflineStateOverlay';
import ConfirmDialogModal from '../common/ConfirmDialogModal';

import { useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import { useAttendanceEngine } from '../../hooks/useAttendanceEngine';
import { useExcelOperations } from '../../hooks/useExcelOperations';

export default function GlobalModalsContainer() {
  const {
    state,
    setState,
    saveState,
    isOffline,
    setIsOffline,
    pendingSyncCount,
    setPendingSyncCount,
    computeEmpSummary
  } = useData();

  const {
    toast,
    showToast,
    monthPicker,
    ownerOverrideModal,
    setOwnerOverrideModal,
    isEmpModalOpen,
    setIsEmpModalOpen,
    editingEmp,
    selectedEmpCard,
    setSelectedEmpCard,
    qrCardDataUrl,
    editingShift,
    setEditingShift,
    isEmpFileModalOpen,
    setIsEmpFileModalOpen,
    editingEmpFile,
    setEditingEmpFile,
    isEmpPhonesModalOpen,
    setIsEmpPhonesModalOpen,
    isExportModalOpen,
    setIsExportModalOpen,
    exportType,
    setExportType,
    exportEmpId,
    setExportEmpId,
    exportRangeMode,
    setExportRangeMode,
    exportStartDate,
    setExportStartDate,
    exportEndDate,
    setExportEndDate,
    kioskConfirmModal,
    kioskInquiryModal,
    setKioskInquiryModal,
    inspectedEmp,
    setInspectedEmp,
    openEditShift,
    confirmModal,
    handleConfirmAction
  } = useUI();

  const {
    saveEditShift,
    deleteShift,
    handleAdminDeviceStatus
  } = useAttendanceEngine();

  const {
    exportEmpExcel,
    exportAllPayrollExcel
  } = useExcelOperations();

  // Employee Add/Edit Modal Internal Form State
  const [empName, setEmpName] = useState('');
  const [empNickname, setEmpNickname] = useState('');
  const [empCode, setEmpCode] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empJobTitle, setEmpJobTitle] = useState('مساعد صيدلي');
  const [empSalary, setEmpSalary] = useState('4000');
  const [empWorkHours, setEmpWorkHours] = useState('8');
  const [empWorkDays, setEmpWorkDays] = useState('26');
  const [empPassword, setEmpPassword] = useState('123');
  const [empAnnualLeaveBalance, setEmpAnnualLeaveBalance] = useState('21');
  const [empPhotoUrl, setEmpPhotoUrl] = useState('');

  useEffect(() => {
    if (editingEmp) {
      setEmpName(editingEmp.name || '');
      setEmpNickname(editingEmp.nickname || '');
      setEmpCode(editingEmp.code || '');
      setEmpPhone(editingEmp.phone || '');
      setEmpJobTitle(editingEmp.jobTitle || 'مساعد صيدلي');
      setEmpSalary(String(editingEmp.salary || 0));
      setEmpWorkHours(String(editingEmp.workHoursPerDay || 8));
      setEmpWorkDays(String(editingEmp.workDaysPerMonth || 26));
      setEmpPassword(editingEmp.password || '123');
      setEmpAnnualLeaveBalance(String(editingEmp.annualLeaveBalance !== undefined ? editingEmp.annualLeaveBalance : 21));
      setEmpPhotoUrl(editingEmp.photoUrl || '');
    } else {
      setEmpName('');
      setEmpNickname('');
      setEmpCode(String(101 + (state.employees || []).length));
      setEmpPhone('');
      setEmpJobTitle('مساعد صيدلي');
      setEmpSalary('4000');
      setEmpWorkHours('8');
      setEmpWorkDays('26');
      setEmpPassword('123');
      setEmpAnnualLeaveBalance('21');
      setEmpPhotoUrl('');
    }
  }, [editingEmp, isEmpModalOpen, state.employees]);

  const handleFileUpload = async (e, callback) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 10 ميجابايت');
      return;
    }
    try {
      const compressedDataUrl = await compressImage(file, 1000, 0.75);
      callback(compressedDataUrl);
      showToast('تم رفع وتجهيز الصورة بنجاح');
    } catch (err) {
      console.error('Image compression failed:', err);
      showToast('حدث خطأ أثناء رفع الصورة');
    }
  };

  const handleSaveEmp = async () => {
    if (!empName.trim() || !empCode.trim()) {
      showToast('يرجى تعبئة الاسم وكود الموظف');
      return;
    }

    const cleanEmpCode = empCode.trim().toLowerCase();
    const isDuplicate = (state.employees || []).some((e) =>
      ((e.code && e.code.trim().toLowerCase() === cleanEmpCode) || (e.username && e.username.trim().toLowerCase() === cleanEmpCode)) &&
      e.id !== (editingEmp ? editingEmp.id : null)
    );
    if (isDuplicate) {
      showToast('⚠️ خطأ: كود الموظف مستخدم بالفعل لموظف آخر!');
      return;
    }

    const branchConflict = (state.branches || []).find(
      (b) => b.username && b.username.trim().toLowerCase() === cleanEmpCode
    );
    if (branchConflict) {
      showToast(`⚠️ خطأ: كود الموظف (${empCode.trim()}) مستخدم كاسم مستخدم لفرع "${branchConflict.name}"!`);
      return;
    }

    const salary = parseArabicFloat(empSalary);
    const workHoursPerDay = parseArabicFloat(empWorkHours) || 8;
    const workDaysPerMonth = parseArabicFloat(empWorkDays) || 26;
    const annualLeaveBalance = parseArabicFloat(empAnnualLeaveBalance) || 0;

    let updatedEmps = [];
    if (editingEmp) {
      updatedEmps = (state.employees || []).map((e) =>
        e.id === editingEmp.id
          ? {
              ...e,
              name: empName.trim(),
              nickname: empNickname.trim(),
              code: empCode.trim(),
              username: empCode.trim(),
              phone: empPhone.trim(),
              jobTitle: empJobTitle.trim() || 'موظف',
              salary,
              workHoursPerDay,
              workDaysPerMonth,
              password: empPassword.trim() || '123',
              annualLeaveBalance,
              photoUrl: empPhotoUrl.trim()
            }
          : e
      );
      showToast(`تم تعديل بيانات الموظف "${empName}" بنجاح`);
    } else {
      const newEmp = {
        id: 'emp_' + uid(),
        name: empName.trim(),
        nickname: empNickname.trim(),
        code: empCode.trim(),
        username: empCode.trim(),
        phone: empPhone.trim(),
        jobTitle: empJobTitle.trim() || 'موظف',
        salary,
        workHoursPerDay,
        workDaysPerMonth,
        password: empPassword.trim() || '123',
        annualLeaveBalance,
        photoUrl: empPhotoUrl.trim(),
        createdAt: getRealTodayStr(),
        devices: []
      };
      updatedEmps = [...(state.employees || []), newEmp];
      showToast(`تمت إضافة الموظف الجديد "${newEmp.name}" بنجاح`);
    }

    const updatedState = { ...state, employees: updatedEmps };
    setState(updatedState);
    await saveState(updatedState);
    setIsEmpModalOpen(false);

    // Auto-sync Word document to Google Drive in background
    const driveConfig = state?.orgSettings?.driveConfig;
    if (driveConfig && driveConfig.enabled && driveConfig.serviceUrl && driveConfig.autoSyncOnEmployeeSave !== false) {
      const targetEmp = updatedEmps.find(e => e.id === (editingEmp ? editingEmp.id : updatedEmps[updatedEmps.length - 1]?.id));
      if (targetEmp) {
        syncEmployeeEntireDrive(targetEmp, state.orgSettings)
          .then(res => {
            if (res.success && res.updatedEmp && setState) {
              setState(prev => {
                const emps = (prev.employees || []).map(e => String(e.id) === String(res.updatedEmp.id) ? res.updatedEmp : e);
                const nextState = { ...prev, employees: emps };
                if (saveState) saveState(nextState);
                return nextState;
              });
            }
          })
          .catch(err => console.warn('Drive auto sync error:', err));
      }
    }
  };

  return (
    <>
      {/* 1. Admin Employee Shift Inspector Modal */}
      {inspectedEmp && (
        <div className="modal-overlay" onClick={() => setInspectedEmp(null)}>
          <div className="modal-card inspect-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '850px' }}>
            <div className="badge-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="emp-avatar-circle">
                  {inspectedEmp.photoUrl ? <img src={inspectedEmp.photoUrl} alt={inspectedEmp.name} /> : <span>{inspectedEmp.name.charAt(0)}</span>}
                </div>
                <div>
                  <h3>سجل بصمات الموظف — {inspectedEmp.name}</h3>
                  <span className="job-sub">كود: {inspectedEmp.code} · {inspectedEmp.jobTitle}</span>
                </div>
              </div>
              <button className="close-btn" onClick={() => setInspectedEmp(null)}>✕</button>
            </div>

            {(() => {
              const summary = computeEmpSummary(inspectedEmp.id, (d) => d.startsWith(monthPicker), monthPicker);
              const empShifts = (state.shifts || [])
                .filter((s) => s.employeeId === inspectedEmp.id && s.date.startsWith(monthPicker))
                .sort((a, b) => (a.date === b.date ? a.timeIn.localeCompare(b.timeIn) : a.date.localeCompare(b.date)));

              return (
                <>
                  <div className="summary-grid" style={{ marginTop: '16px' }}>
                    <div className="summary-box"><div className="label">ساعات الشهر</div><div className="value">{fmt(summary.hours)} س</div></div>
                    <div className="summary-box"><div className="label">أجر الساعة</div><div className="value">{fmt(summary.rate)} ج.م</div></div>
                    <div className="summary-box"><div className="label">المستحقات الأساسية</div><div className="value">{fmt(summary.baseEarnings)} ج.م</div></div>
                    <div className="summary-box"><div className="label">المكافآت</div><div className="value" style={{ color: 'var(--success)' }}>+{fmt(summary.totalBonus)}</div></div>
                    <div className="summary-box"><div className="label">الخصومات</div><div className="value" style={{ color: 'var(--danger)' }}>-{fmt(summary.totalDeduction)}</div></div>
                    <div className="summary-box total"><div className="label">صافي المرتب المستحق</div><div className="value">{fmt(summary.netSalary)} ج.م</div></div>
                  </div>

                  <div className="table-responsive" style={{ maxHeight: '350px', overflowY: 'auto', marginTop: '16px' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>التاريخ</th>
                          <th>الدخول</th>
                          <th>الخروج</th>
                          <th>البريك</th>
                          <th>الساعات</th>
                          <th>الملاحظة</th>
                          <th>الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empShifts.length === 0 ? (
                          <tr className="empty-row"><td colSpan="7">لا توجد ورادات مسجلة لهذا الشهر</td></tr>
                        ) : (
                          empShifts.map((s) => (
                            <tr key={s.id}>
                              <td>{s.date} ({arabicWeekday(s.date)})</td>
                              <td>{s.timeIn}</td>
                              <td>{s.timeOut}</td>
                              <td>{fmt(s.breakHours || 0)} س</td>
                              <td className="money" style={{ color: 'var(--primary-dark)' }}>{fmt(getEffectiveShiftHours(s, state))} س</td>
                              <td>{s.note || '—'}</td>
                              <td>
                                <button className="del-btn" style={{ color: 'var(--primary)', marginLeft: '6px' }} onClick={() => openEditShift(s)}>✏️ تعديل</button>
                                <button className="del-btn" onClick={() => deleteShift(s.id)}>🗑️ حذف</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-ghost" onClick={() => setInspectedEmp(null)}>إغلاق</button>
              <button className="btn btn-start" onClick={() => exportEmpExcel(inspectedEmp.id, 'month')}>📥 تصدير شيت إكسل للموظف</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Admin Add/Edit Employee Modal */}
      <EmployeeModal
        isEmpModalOpen={isEmpModalOpen}
        setIsEmpModalOpen={setIsEmpModalOpen}
        editingEmp={editingEmp}
        empPhotoUrl={empPhotoUrl}
        setEmpPhotoUrl={setEmpPhotoUrl}
        empName={empName}
        setEmpName={setEmpName}
        empNickname={empNickname}
        setEmpNickname={setEmpNickname}
        empCode={empCode}
        setEmpCode={setEmpCode}
        empPhone={empPhone}
        setEmpPhone={setEmpPhone}
        empJobTitle={empJobTitle}
        setEmpJobTitle={setEmpJobTitle}
        empSalary={empSalary}
        setEmpSalary={setEmpSalary}
        empWorkHours={empWorkHours}
        setEmpWorkHours={setEmpWorkHours}
        empWorkDays={empWorkDays}
        setEmpWorkDays={setEmpWorkDays}
        empPassword={empPassword}
        setEmpPassword={setEmpPassword}
        empAnnualLeaveBalance={empAnnualLeaveBalance}
        setEmpAnnualLeaveBalance={setEmpAnnualLeaveBalance}
        handleFileUpload={handleFileUpload}
        handleSaveEmp={handleSaveEmp}
        handleAdminDeviceStatus={handleAdminDeviceStatus}
      />

      {/* 3. Employee ID Card Modal */}
      <EmployeeIDCardModal
        selectedEmpCard={selectedEmpCard}
        setSelectedEmpCard={setSelectedEmpCard}
        orgSettings={state.orgSettings}
        qrCardDataUrl={qrCardDataUrl}
      />

      {/* 4. Employee Comprehensive File Modal */}
      {isEmpFileModalOpen && (
        <EmployeeFileModal
          isOpen={isEmpFileModalOpen}
          emp={editingEmpFile}
          editingEmp={editingEmpFile}
          branches={state.branches || []}
          allEmployees={state.employees || []}
          jobs={state.orgSettings?.jobs}
          departments={state.orgSettings?.departments}
          onClose={() => {
            setIsEmpFileModalOpen(false);
            setEditingEmpFile(null);
          }}
          state={state}
          setState={setState}
          saveState={saveState}
          showToast={showToast}
        />
      )}

      {/* 5. Employee Phones Directory Modal */}
      {isEmpPhonesModalOpen && (
        <EmployeePhonesDirectoryModal
          employees={state.employees || []}
          branches={state.branches || []}
          onClose={() => setIsEmpPhonesModalOpen(false)}
        />
      )}

      {/* 6. Edit Shift Modal */}
      <EditShiftModal
        editingShift={editingShift}
        setEditingShift={setEditingShift}
        saveEditShift={saveEditShift}
      />

      {/* 7. Kiosk Biometric Confirmation Modal */}
      <KioskConfirmModal kioskConfirmModal={kioskConfirmModal} />

      {/* 8. Kiosk Inquiry Status Modal */}
      {kioskInquiryModal && (
        <div className="modal-overlay" onClick={() => setKioskInquiryModal(null)}>
          <div className="modal-card inquiry-card" onClick={(e) => e.stopPropagation()}>
            <div className="badge-header">
              <h3>🔍 تفاصيل حالة الموظف والشيفت</h3>
              <button className="close-btn" onClick={() => setKioskInquiryModal(null)}>✕</button>
            </div>

            <div className="badge-body" style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div className="emp-avatar-circle">
                  {kioskInquiryModal.emp?.photoUrl ? (
                    <img src={kioskInquiryModal.emp.photoUrl} alt={kioskInquiryModal.emp.name} />
                  ) : (
                    <span>{kioskInquiryModal.emp?.name?.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h3 style={{ margin: 0 }}>{kioskInquiryModal.emp?.name}</h3>
                  <span className="job-sub">كود الموظف: {kioskInquiryModal.emp?.code} · {kioskInquiryModal.emp?.jobTitle}</span>
                </div>
              </div>

              <div className="inquiry-box" style={{ marginBottom: '10px' }}>
                <div>حالة الوردية الحالية:</div>
                {kioskInquiryModal.active ? (
                  kioskInquiryModal.active.isPaused ? (
                    <strong style={{ color: 'var(--accent)' }}>⏸️ في استراحة بريك</strong>
                  ) : (
                    <strong style={{ color: 'var(--success)' }}>🟢 على رأس العمل (الوقت المنقضي: {kioskInquiryModal.elapsedStr})</strong>
                  )
                ) : (
                  <strong style={{ color: 'var(--muted)' }}>⚪ غير متواجد على رأس العمل حالياً</strong>
                )}
              </div>

              <div className="inquiry-box">
                <div>إجمالي ساعات اليوم المسجلة:</div>
                <strong style={{ color: 'var(--primary-dark)', fontSize: '18px' }}>{kioskInquiryModal.todayHours} ساعة</strong>
              </div>
            </div>

            <button className="btn btn-start" style={{ width: '100%', marginTop: '16px' }} onClick={() => setKioskInquiryModal(null)}>
              إغلاق نافذة الاستعلام
            </button>
          </div>
        </div>
      )}

      {/* 9. Export Payroll Modal */}
      <ExportPayrollModal
        isExportModalOpen={isExportModalOpen}
        setIsExportModalOpen={setIsExportModalOpen}
        exportType={exportType}
        setExportType={setExportType}
        exportEmpId={exportEmpId}
        setExportEmpId={setExportEmpId}
        exportRangeMode={exportRangeMode}
        setExportRangeMode={setExportRangeMode}
        exportStartDate={exportStartDate}
        setExportStartDate={setExportStartDate}
        exportEndDate={exportEndDate}
        setExportEndDate={setExportEndDate}
        state={state}
        monthPicker={monthPicker}
        exportEmpExcel={exportEmpExcel}
        exportAllPayrollExcel={exportAllPayrollExcel}
      />

      {/* 10. Owner Override Verification Modal */}
      <OwnerOverrideModal
        isOpen={ownerOverrideModal.isOpen}
        onClose={() => setOwnerOverrideModal((prev) => ({ ...prev, isOpen: false }))}
        onSuccess={ownerOverrideModal.onSuccess}
        actionTitle={ownerOverrideModal.actionTitle}
        actionDetails={ownerOverrideModal.actionDetails}
        state={state}
        showToast={showToast}
      />

      {/* 11. Offline State Overlay */}
      <OfflineStateOverlay
        isOffline={isOffline}
        pendingCount={pendingSyncCount}
        onRetrySync={async () => {
          const res = await syncNow();
          if (res.success && res.mergedState) {
            setState((prev) => normalizeState(smartMergeStates(prev, normalizeState(res.mergedState))));
            setPendingSyncCount(0);
            setIsOffline(false);
            showToast('✅ تمت استعادة الاتصال وتحديث البيانات بنجاح');
          }
        }}
        showToast={showToast}
      />

      {/* 12. Global Toast Notification */}
      <div className={`toast ${toast.show ? 'show' : ''}`}>{toast.message}</div>

      {/* 13. Universal Custom In-App Confirmation Modal */}
      <ConfirmDialogModal
        isOpen={Boolean(confirmModal?.isOpen)}
        title={confirmModal?.title}
        message={confirmModal?.message}
        confirmText={confirmModal?.confirmText}
        cancelText={confirmModal?.cancelText}
        type={confirmModal?.type}
        icon={confirmModal?.icon}
        onConfirm={() => handleConfirmAction(true)}
        onCancel={() => handleConfirmAction(false)}
      />
    </>
  );
}
