import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { getRealDate, getRealTodayStr } from '../utils/timeEngine';
import { getActivePayrollMonth, createDatePredicate } from '../utils/periodEngine';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const { authRole } = useAuth();
  const { state } = useData();

  // Toast Notification System
  const [toast, setToast] = useState({ message: '', show: false });
  const showToast = useCallback((msg) => {
    setToast({ message: msg, show: true });
    setTimeout(() => {
      setToast({ message: '', show: false });
    }, 3200);
  }, []);

  // Universal In-App Confirmation Modal System
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: 'تأكيد الإجراء',
    message: '',
    confirmText: 'تأكيد',
    cancelText: 'إلغاء وتراجع',
    type: 'danger',
    icon: null,
    resolve: null
  });

  const showConfirm = useCallback((options) => {
    const config = typeof options === 'string'
      ? { message: options }
      : (options || {});

    const {
      title = 'تأكيد الإجراء',
      message = 'هل أنت متأكد من تنفيذ هذا الإجراء؟',
      confirmText = 'تأكيد',
      cancelText = 'إلغاء وتراجع',
      type = 'danger',
      icon = null
    } = config;

    return new Promise((resolve) => {
      setConfirmModal({
        isOpen: true,
        title,
        message,
        confirmText,
        cancelText,
        type,
        icon,
        resolve
      });
    });
  }, []);

  const handleConfirmAction = useCallback((isConfirmed) => {
    if (confirmModal.resolve) {
      confirmModal.resolve(isConfirmed);
    }
    setConfirmModal((prev) => ({ ...prev, isOpen: false, resolve: null }));
  }, [confirmModal]);

  // Filter State (Month & Custom Date Range)
  const [adminFilterMode, setAdminFilterMode] = useState(() => {
    try { return localStorage.getItem('admin_filter_mode') || 'month'; } catch { return 'month'; }
  });

  const [monthPicker, setMonthPicker] = useState(() => {
    try {
      const activeAutoCycle = getActivePayrollMonth(state?.orgSettings, getRealDate());
      return activeAutoCycle || localStorage.getItem('admin_month_picker') || getRealTodayStr().slice(0, 7);
    } catch { return getRealTodayStr().slice(0, 7); }
  });

  const [adminCustomFrom, setAdminCustomFrom] = useState(() => {
    try { return localStorage.getItem('admin_custom_from') || ''; } catch { return ''; }
  });

  const [adminCustomTo, setAdminCustomTo] = useState(() => {
    try { return localStorage.getItem('admin_custom_to') || ''; } catch { return ''; }
  });

  // Persist filter settings
  useEffect(() => {
    try {
      localStorage.setItem('admin_filter_mode', adminFilterMode);
      localStorage.setItem('admin_month_picker', monthPicker);
      localStorage.setItem('admin_custom_from', adminCustomFrom);
      localStorage.setItem('admin_custom_to', adminCustomTo);
    } catch {}
  }, [adminFilterMode, monthPicker, adminCustomFrom, adminCustomTo]);

  // Current Filter Predicate Function
  const currentFilterFn = useCallback((dateStr) => {
    return createDatePredicate({
      filterMode: adminFilterMode,
      selectedMonth: monthPicker,
      customFrom: adminCustomFrom,
      customTo: adminCustomTo,
      orgSettings: state?.orgSettings
    })(dateStr);
  }, [adminFilterMode, monthPicker, adminCustomFrom, adminCustomTo, state?.orgSettings]);

  // Owner Override Guard State & Executor
  const [ownerOverrideModal, setOwnerOverrideModal] = useState({
    isOpen: false,
    actionTitle: '',
    actionDetails: '',
    onSuccess: null
  });

  const executeWithOwnerGuard = useCallback(({ lockKey, actionTitle, actionDetails, onExecute }) => {
    if (authRole === 'owner') {
      onExecute?.();
      return;
    }
    const isLocked = state?.orgSettings?.ownerModificationLocks?.[lockKey];
    if (isLocked) {
      setOwnerOverrideModal({
        isOpen: true,
        actionTitle: actionTitle || 'إجراء محمي بتصريح المالك',
        actionDetails: actionDetails || '',
        onSuccess: onExecute
      });
    } else {
      onExecute?.();
    }
  }, [authRole, state?.orgSettings?.ownerModificationLocks]);

  // Employee Add/Edit Modal
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);

  // Employee Digital ID Card Modal
  const [selectedEmpCard, setSelectedEmpCard] = useState(null);
  const [qrCardDataUrl, setQrCardDataUrl] = useState('');

  const openEmpCard = async (emp) => {
    setSelectedEmpCard(emp);
    try {
      const url = await QRCode.toDataURL(emp.code || 'EMP', { width: 220, margin: 2 });
      setQrCardDataUrl(url);
    } catch {
      setQrCardDataUrl('');
    }
  };

  // Shift Edit Modal
  const [editingShift, setEditingShift] = useState(null);
  const openEditShift = (shift) => {
    setEditingShift({
      ...shift,
      breakHours: shift.breakHours !== undefined ? shift.breakHours : 0
    });
  };

  // Employee File & Directory Modals
  const [isEmpFileModalOpen, setIsEmpFileModalOpen] = useState(false);
  const [editingEmpFile, setEditingEmpFile] = useState(null);
  const [isEmpPhonesModalOpen, setIsEmpPhonesModalOpen] = useState(false);

  const openEmpFileModal = (emp) => {
    setEditingEmpFile(emp);
    setIsEmpFileModalOpen(true);
  };

  const openEmpPhonesModal = () => {
    setIsEmpPhonesModalOpen(true);
  };

  // Export Payroll Modal
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportType, setExportType] = useState('all');
  const [exportEmpId, setExportEmpId] = useState('');
  const [exportRangeMode, setExportRangeMode] = useState('month');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

  const openExportModal = ({ type = 'all', empId = '' } = {}) => {
    setExportType(type);
    if (empId) setExportEmpId(empId);
    setIsExportModalOpen(true);
  };

  // Kiosk Modals
  const [kioskConfirmModal, setKioskConfirmModal] = useState({ open: false });
  const [kioskInquiryModal, setKioskInquiryModal] = useState(null);

  // Inspected Employee Shift Sheet Modal
  const [inspectedEmp, setInspectedEmp] = useState(null);

  const value = {
    toast,
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
    ownerOverrideModal,
    setOwnerOverrideModal,
    executeWithOwnerGuard,
    isEmpModalOpen,
    setIsEmpModalOpen,
    editingEmp,
    setEditingEmp,
    selectedEmpCard,
    setSelectedEmpCard,
    qrCardDataUrl,
    openEmpCard,
    editingShift,
    setEditingShift,
    openEditShift,
    isEmpFileModalOpen,
    setIsEmpFileModalOpen,
    editingEmpFile,
    setEditingEmpFile,
    openEmpFileModal,
    isEmpPhonesModalOpen,
    setIsEmpPhonesModalOpen,
    openEmpPhonesModal,
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
    openExportModal,
    kioskConfirmModal,
    setKioskConfirmModal,
    kioskInquiryModal,
    setKioskInquiryModal,
    inspectedEmp,
    setInspectedEmp,
    confirmModal,
    showConfirm,
    handleConfirmAction
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}
