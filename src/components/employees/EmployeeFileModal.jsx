import React, { useState, useEffect } from 'react';
import { compressImage } from '../../utils/imageCompressor';
import { DEFAULT_JOBS, isManagementJob, DEFAULT_DEPARTMENTS, getJobsList, getDepartmentsList } from '../../utils/jobsHelper';
import { syncEmployeeEntireDrive } from '../../utils/googleDriveService';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';

export default function EmployeeFileModal({
  isOpen,
  onClose,
  editingEmp,
  emp,
  branches = [],
  allEmployees = [],
  jobs = DEFAULT_JOBS,
  departments = DEFAULT_DEPARTMENTS,
  onSave,
  handleFileUpload,
  executeWithOwnerGuard: propExecuteWithOwnerGuard,
  state,
  setState,
  saveState,
  showToast
}) {
  const { showConfirm, executeWithOwnerGuard: contextExecuteWithOwnerGuard } = useUI();
  const { authRole } = useAuth?.() || {};
  const executeWithOwnerGuard = propExecuteWithOwnerGuard || contextExecuteWithOwnerGuard;
  const currentEmp = editingEmp || emp;

  // Reactively derive jobs and departments from state if custom ones exist
  const effectiveJobs = (jobs && jobs !== DEFAULT_JOBS && jobs.length > 0)
    ? jobs
    : (state ? getJobsList(state) : (jobs || DEFAULT_JOBS));
  const effectiveDepartments = (departments && departments !== DEFAULT_DEPARTMENTS && departments.length > 0)
    ? departments
    : (state ? getDepartmentsList(state) : (departments || DEFAULT_DEPARTMENTS));

  const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'job' | 'financial' | 'documents'

  // Escape key listener for keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Google Drive Cloud State
  const [driveFolderId, setDriveFolderId] = useState('');
  const [driveFolderUrl, setDriveFolderUrl] = useState('');
  const [biometricFolderId, setBiometricFolderId] = useState('');
  const [driveLastSyncAt, setDriveLastSyncAt] = useState('');
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [driveSyncMsg, setDriveSyncMsg] = useState('');

  // 1. Personal Data
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [phones, setPhones] = useState([
    { id: '1', number: '', type: 'mobile' }
  ]);
  const [email, setEmail] = useState('');
  const [relativePhone, setRelativePhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('أعزب');

  // Employee Photo Upload Handler
  const handlePhotoUpload = async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      if (showToast) showToast('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 10 ميجابايت');
      else alert('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 10 ميجابايت');
      if (e?.target) e.target.value = '';
      return;
    }

    try {
      if (handleFileUpload) {
        await handleFileUpload(e, (url) => setPhotoUrl(url));
      } else {
        const compressedDataUrl = await compressImage(file, 1000, 0.75);
        setPhotoUrl(compressedDataUrl);
        if (showToast) showToast('تم رفع وتجهيز الصورة بنجاح');
      }
    } catch (err) {
      console.error('Failed to upload employee photo:', err);
      if (showToast) showToast('حدث خطأ أثناء رفع الصورة');
    } finally {
      if (e?.target) e.target.value = '';
    }
  };

  // Phone list handlers
  const handleAddPhoneField = () => {
    setPhones([
      ...phones,
      { id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4), number: '', type: 'mobile' }
    ]);
  };

  const handlePhoneChange = (id, field, value) => {
    setPhones(phones.map(p => {
      if (p.id === id) {
        if (field === 'number') {
          // Numbers only validation
          const numericOnly = value.replace(/\D/g, '');
          return { ...p, number: numericOnly };
        }
        return { ...p, [field]: value };
      }
      return p;
    }));
  };

  const handleRemovePhoneField = (id) => {
    if (phones.length <= 1) {
      setPhones([{ id: '1', number: '', type: 'mobile' }]);
      return;
    }
    setPhones(phones.filter(p => p.id !== id));
  };

  // 2. Job Data
  const [code, setCode] = useState('');
  const [jobTitle, setJobTitle] = useState('صيدلي');
  const [department, setDepartment] = useState('الصيدلية');
  
  // 3. Financial & Branches & Schedule (Multi-Branch Support)
  const [branchesDetails, setBranchesDetails] = useState([
    { id: Date.now().toString(), branchId: '', salary: '', workHours: '', workDays: '', breakHours: '' }
  ]);
  // Preserved/Archived financial data for branches the employee was unassigned from
  const [archivedBranchesDetails, setArchivedBranchesDetails] = useState([]);

  // Financial Allowances States
  const [managementAllowance, setManagementAllowance] = useState('0');
  const [transportAllowance, setTransportAllowance] = useState('0');
  const [extraAllowance, setExtraAllowance] = useState('0');
  const [extraAllowanceTitle, setExtraAllowanceTitle] = useState('');
  // Multiple Extra Allowances: Array of { id, title, amount }
  const [extraAllowances, setExtraAllowances] = useState([]);

  // Daily Attendance Allowance States (البدل اليومي المرتبط بالبصمة)
  const [dailyAllowanceAmount, setDailyAllowanceAmount] = useState('0');
  const [dailyAllowanceTitle, setDailyAllowanceTitle] = useState('بدل يومي');
  const [dailyAllowances, setDailyAllowances] = useState([]);

  const handleAddDailyAllowance = () => {
    setDailyAllowances([
      ...dailyAllowances,
      { id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4), title: '', amount: '0' }
    ]);
  };

  const handleDailyAllowanceChange = (id, field, value) => {
    setDailyAllowances(dailyAllowances.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const handleRemoveDailyAllowance = (id) => {
    setDailyAllowances(dailyAllowances.filter(a => a.id !== id));
  };

  const handleAddExtraAllowance = () => {
    setExtraAllowances([
      ...extraAllowances,
      { id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4), title: '', amount: '0' }
    ]);
  };

  const handleExtraAllowanceChange = (id, field, value) => {
    setExtraAllowances(extraAllowances.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const handleRemoveExtraAllowance = (id) => {
    setExtraAllowances(extraAllowances.filter(a => a.id !== id));
  };

  // Branch Selection & Re-activation Handler
  const handleBranchSelectChange = (idx, selectedBranchId) => {
    const newBd = [...branchesDetails];
    
    // Check if the selected branch has previously saved financial data in archivedBranchesDetails
    const foundArchived = archivedBranchesDetails.find(ab => String(ab.branchId) === String(selectedBranchId));
    
    if (foundArchived) {
      // Re-activate previously saved financial configuration!
      newBd[idx] = {
        ...newBd[idx],
        branchId: selectedBranchId,
        salary: String(foundArchived.salary !== undefined ? foundArchived.salary : ''),
        workHours: String(foundArchived.workHours || foundArchived.workHoursPerDay || ''),
        workDays: String(foundArchived.workDays || foundArchived.workDaysPerMonth || ''),
        breakHours: String(foundArchived.breakHours || foundArchived.defaultBreakHours || '')
      };
      // Remove from archived list since it is now active
      setArchivedBranchesDetails(prev => prev.filter(ab => String(ab.branchId) !== String(selectedBranchId)));
    } else {
      newBd[idx] = {
        ...newBd[idx],
        branchId: selectedBranchId
      };
    }
    setBranchesDetails(newBd);
  };

  // Branch Removal Handler (Preserves financial data in archivedBranchesDetails)
  const handleRemoveActiveBranch = (idx) => {
    const targetBranch = branchesDetails[idx];
    if (targetBranch && targetBranch.branchId && targetBranch.branchId.trim()) {
      const bId = targetBranch.branchId.trim();
      const branchObj = branches.find(b => String(b.id) === String(bId));
      
      // Preserve financial data in archivedBranchesDetails
      setArchivedBranchesDetails(prev => {
        const filtered = prev.filter(ab => String(ab.branchId) !== String(bId));
        return [
          ...filtered,
          {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4),
            branchId: bId,
            branchName: branchObj ? branchObj.name : (targetBranch.branchName || 'فرع غير معروف'),
            branchCode: branchObj ? branchObj.branchCode : '',
            salary: String(targetBranch.salary !== undefined ? targetBranch.salary : ''),
            workHours: String(targetBranch.workHours || targetBranch.workHoursPerDay || ''),
            workDays: String(targetBranch.workDays || targetBranch.workDaysPerMonth || ''),
            breakHours: String(targetBranch.breakHours || targetBranch.defaultBreakHours || ''),
            archivedAt: new Date().toISOString()
          }
        ];
      });
    }

    if (branchesDetails.length <= 1) {
      setBranchesDetails([{ id: Math.random().toString(), branchId: '', salary: '', workHours: '', workDays: '', breakHours: '' }]);
    } else {
      setBranchesDetails(branchesDetails.filter((_, i) => i !== idx));
    }
  };

  // Permanently delete an archived branch salary record
  const handleDeleteArchivedBranch = async (branchIdToDelete) => {
    const target = archivedBranchesDetails.find(ab => String(ab.branchId) === String(branchIdToDelete));
    const branchName = target?.branchName || branches.find(b => String(b.id) === String(branchIdToDelete))?.name || 'هذا الفرع';
    const isConfirmed = await showConfirm({
      title: 'حذف سجل راتب الفرع المؤرشف',
      message: `هل أنت متأكد من حذف بيانات وراتب "${branchName}" نهائياً من سجل الموظف؟`,
      confirmText: 'تأكيد الحذف',
      cancelText: 'إلغاء وتراجع',
      type: 'danger',
      icon: '🏢'
    });
    if (isConfirmed) {
      setArchivedBranchesDetails(prev => prev.filter(ab => String(ab.branchId) !== String(branchIdToDelete)));
    }
  };

  const [hireDate, setHireDate] = useState('');
  const [contractType, setContractType] = useState('دوام كامل');
  const [status, setStatus] = useState('على رأس العمل'); // 'على رأس العمل' | 'تم الاستقالة'
  const [terminationReason, setTerminationReason] = useState('');
  const [password, setPassword] = useState('123');
  const [annualLeaveBalance, setAnnualLeaveBalance] = useState('21');

  // 4. Documents Data (Array of { id, title, fileUrl, fileType, uploadedAt })
  const [documents, setDocuments] = useState([]);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [selectedDocType, setSelectedDocType] = useState('الرقم القومي');
  const [previewDoc, setPreviewDoc] = useState(null);
  const [codeError, setCodeError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('personal');
    }
    if (editingEmp) {
      if (Array.isArray(editingEmp.phones) && editingEmp.phones.length > 0) {
        setPhones(editingEmp.phones.map((p, idx) => ({
          id: (typeof p === 'object' && p?.id) || String(idx + 1),
          number: typeof p === 'string' ? String(p).replace(/\D/g, '') : (p?.number ? String(p.number).replace(/\D/g, '') : ''),
          type: (typeof p === 'object' && p?.type) || 'mobile'
        })));
      } else if (editingEmp.phone && String(editingEmp.phone).trim()) {
        setPhones([
          { id: '1', number: String(editingEmp.phone).replace(/\D/g, ''), type: 'mobile' }
        ]);
      } else {
        setPhones([
          { id: '1', number: '', type: 'mobile' }
        ]);
      }

      setName(editingEmp.name || '');
      setNickname(editingEmp.nickname || '');
      setPhone(editingEmp.phone || '');
      setEmail(editingEmp.email || '');
      setRelativePhone(String(editingEmp.relativePhone || editingEmp.emergencyPhone || '').replace(/\D/g, ''));
      setNationalId(String(editingEmp.nationalId || '').replace(/\D/g, ''));
      setDob(editingEmp.dob || '');
      setAddress(editingEmp.address || '');
      setPhotoUrl(editingEmp.photoUrl || '');
      setMaritalStatus(editingEmp.maritalStatus || 'أعزب');

      let initialEmpCode = editingEmp.code || '';
      if (!initialEmpCode) {
        let candidateNum = 100 + ((allEmployees || []).length + 1);
        const isTaken = (cand) => {
          const strCand = String(cand).toLowerCase();
          const empTaken = (allEmployees || []).some(e => 
            (e.code && String(e.code).trim().toLowerCase() === strCand) ||
            (e.username && String(e.username).trim().toLowerCase() === strCand)
          );
          const branchTaken = (branches || []).some(b => 
            b.username && String(b.username).trim().toLowerCase() === strCand
          );
          return empTaken || branchTaken;
        };
        while (isTaken(candidateNum)) {
          candidateNum++;
        }
        initialEmpCode = String(candidateNum);
      }
      setCode(initialEmpCode);
      setJobTitle(editingEmp.jobTitle || 'صيدلي');
      setDepartment(editingEmp.department || jobs.find(j => j.title === editingEmp.jobTitle)?.department || departments[0] || 'الصيدلية');
      
      // Load allowances
      setManagementAllowance(String(editingEmp.managementAllowance !== undefined ? editingEmp.managementAllowance : '0'));
      setTransportAllowance(String(editingEmp.transportAllowance !== undefined ? editingEmp.transportAllowance : '0'));
      setExtraAllowance(String(editingEmp.extraAllowance !== undefined ? editingEmp.extraAllowance : '0'));
      setExtraAllowanceTitle(editingEmp.extraAllowanceTitle || '');

      // Load multiple extra allowances
      const existingExtraList = (Array.isArray(editingEmp.extraAllowances) && editingEmp.extraAllowances.length > 0)
        ? editingEmp.extraAllowances
        : (Array.isArray(editingEmp.customAllowances) && editingEmp.customAllowances.length > 0 ? editingEmp.customAllowances : null);

      if (existingExtraList) {
        setExtraAllowances(existingExtraList.map(a => ({
          id: a.id || Math.random().toString(),
          title: a.title || '',
          amount: String(a.amount !== undefined ? a.amount : '0')
        })));
      } else if ((parseFloat(editingEmp.extraAllowance) || 0) > 0 || (editingEmp.extraAllowanceTitle && editingEmp.extraAllowanceTitle.trim())) {
        setExtraAllowances([{
          id: '1',
          title: editingEmp.extraAllowanceTitle || 'أجر إضافي',
          amount: String(editingEmp.extraAllowance || '0')
        }]);
      } else {
        setExtraAllowances([]);
      }

      // Load daily attendance allowance (البدل اليومي)
      setDailyAllowanceAmount(String(editingEmp.dailyAllowanceAmount !== undefined ? editingEmp.dailyAllowanceAmount : '0'));
      setDailyAllowanceTitle(editingEmp.dailyAllowanceTitle || 'بدل يومي');
      if (Array.isArray(editingEmp.dailyAllowances) && editingEmp.dailyAllowances.length > 0) {
        setDailyAllowances(editingEmp.dailyAllowances.map(a => ({
          id: a.id || Math.random().toString(),
          title: a.title || '',
          amount: String(a.amount !== undefined ? a.amount : '0')
        })));
      } else if ((parseFloat(editingEmp.dailyAllowanceAmount) || 0) > 0) {
        setDailyAllowances([{
          id: 'daily_1',
          title: editingEmp.dailyAllowanceTitle || 'بدل يومي',
          amount: String(editingEmp.dailyAllowanceAmount || '0')
        }]);
      } else {
        setDailyAllowances([]);
      }

      // Load branchesDetails if they exist, otherwise fallback to legacy fields
      let loadedActiveBranches = [];
      if (editingEmp.branchesDetails && editingEmp.branchesDetails.length > 0) {
        loadedActiveBranches = editingEmp.branchesDetails.map(bd => ({
          id: Math.random().toString(),
          branchId: bd.branchId || '',
          salary: String(bd.salary !== undefined ? bd.salary : ''),
          workHours: String(bd.workHoursPerDay !== undefined ? bd.workHoursPerDay : (bd.workHours !== undefined ? bd.workHours : '')),
          workDays: String(bd.workDaysPerMonth !== undefined ? bd.workDaysPerMonth : (bd.workDays !== undefined ? bd.workDays : '')),
          breakHours: String(bd.breakHours !== undefined ? bd.breakHours : (bd.defaultBreakHours !== undefined ? bd.defaultBreakHours : ''))
        }));
      } else {
        loadedActiveBranches = [
          { 
            id: Math.random().toString(),
            branchId: editingEmp.branchId || (branches[0]?.id || ''),
            salary: String(editingEmp.salary !== undefined ? editingEmp.salary : ''),
            workHours: String(editingEmp.workHoursPerDay !== undefined ? editingEmp.workHoursPerDay : (editingEmp.workHours !== undefined ? editingEmp.workHours : '')),
            workDays: String(editingEmp.workDaysPerMonth !== undefined ? editingEmp.workDaysPerMonth : (editingEmp.workDays !== undefined ? editingEmp.workDays : '')),
            breakHours: String(editingEmp.breakHours !== undefined ? editingEmp.breakHours : (editingEmp.defaultBreakHours !== undefined ? editingEmp.defaultBreakHours : ''))
          }
        ];
      }
      setBranchesDetails(loadedActiveBranches);

      // Load preserved / archived branch salaries
      const activeIdsSet = new Set(loadedActiveBranches.map(b => String(b.branchId)).filter(Boolean));
      const rawArchived = editingEmp.archivedBranchesDetails || editingEmp.inactiveBranchesDetails || [];
      const cleanArchived = rawArchived
        .filter(ab => ab.branchId && !activeIdsSet.has(String(ab.branchId)))
        .map(ab => {
          const bObj = branches.find(b => String(b.id) === String(ab.branchId));
          return {
            id: ab.id || Math.random().toString(),
            branchId: ab.branchId,
            branchName: ab.branchName || (bObj ? bObj.name : 'فرع غير معروف'),
            branchCode: ab.branchCode || (bObj ? bObj.branchCode : ''),
            salary: String(ab.salary !== undefined ? ab.salary : ''),
            workHours: String(ab.workHoursPerDay !== undefined ? ab.workHoursPerDay : (ab.workHours !== undefined ? ab.workHours : '')),
            workDays: String(ab.workDaysPerMonth !== undefined ? ab.workDaysPerMonth : (ab.workDays !== undefined ? ab.workDays : '')),
            breakHours: String(ab.breakHours !== undefined ? ab.breakHours : (ab.defaultBreakHours !== undefined ? ab.defaultBreakHours : '')),
            archivedAt: ab.archivedAt || new Date().toISOString()
          };
        });
      setArchivedBranchesDetails(cleanArchived);

      setHireDate(editingEmp.hireDate || '');
      setContractType(editingEmp.contractType || 'دوام كامل');
      const rawStatus = editingEmp.status || (editingEmp.is_active === false ? 'تم الاستقالة' : 'على رأس العمل');
      const isActuallyActive = editingEmp.is_active !== false && rawStatus === 'على رأس العمل';
      setStatus(isActuallyActive ? 'على رأس العمل' : 'تم الاستقالة');
      setTerminationReason(editingEmp.suspension_reason || '');
      setPassword(editingEmp.password || '123');

      setAnnualLeaveBalance(String(editingEmp.annualLeaveBalance !== undefined ? editingEmp.annualLeaveBalance : '21'));

      setDocuments(editingEmp.documents || [
        { id: 'doc_1', title: 'الرقم القومي', fileUrl: '', fileType: 'image' },
        { id: 'doc_2', title: 'شهادة التخرج', fileUrl: '', fileType: 'image' },
        { id: 'doc_3', title: 'كارنيه النقابة', fileUrl: '', fileType: 'image' },
        { id: 'doc_4', title: 'العقد', fileUrl: '', fileType: 'image' }
      ]);

      setDriveFolderId(editingEmp.driveFolderId || '');
      setDriveFolderUrl(editingEmp.driveFolderUrl || '');
      setBiometricFolderId(editingEmp.biometricFolderId || '');
      setDriveLastSyncAt(editingEmp.driveLastSyncAt || '');
    } else {
      setName('');
      setPhone('');
      setPhones([
        { id: '1', number: '', type: 'mobile' }
      ]);
      setRelativePhone('');
      setNationalId('');
      setDob('');
      setAddress('');
      setPhotoUrl('');
      setMaritalStatus('أعزب');

      setDriveFolderId('');
      setDriveFolderUrl('');
      setBiometricFolderId('');
      setDriveLastSyncAt('');

      // Auto-generate safe nextCode that doesn't conflict with any existing employee code or branch username
      let candidateNum = 100 + (allEmployees.length + 1);
      const isTaken = (cand) => {
        const strCand = String(cand).toLowerCase();
        const empTaken = allEmployees.some(e => 
          (e.code && String(e.code).trim().toLowerCase() === strCand) ||
          (e.username && String(e.username).trim().toLowerCase() === strCand)
        );
        const branchTaken = branches.some(b => 
          b.username && String(b.username).trim().toLowerCase() === strCand
        );
        return empTaken || branchTaken;
      };
      while (isTaken(candidateNum)) {
        candidateNum++;
      }
      const nextCode = String(candidateNum);
      setCode(nextCode);
      const defaultJob = jobs[0]?.title || 'صيدلي';
      setJobTitle(defaultJob);
      setDepartment(jobs[0]?.department || departments[0] || 'الصيدلية');
      
      setManagementAllowance('0');
      setTransportAllowance('0');
      setExtraAllowance('0');
      setExtraAllowanceTitle('');
      setExtraAllowances([]);
      setDailyAllowanceAmount('0');
      setDailyAllowanceTitle('بدل يومي');
      setDailyAllowances([]);

      setBranchesDetails([
        { id: Math.random().toString(), branchId: branches[0]?.id || '', salary: '', workHours: '', workDays: '', breakHours: '' }
      ]);
      setArchivedBranchesDetails([]);
      
      setHireDate(new Date().toISOString().slice(0, 10));
      setContractType('دوام كامل');
      setStatus('على رأس العمل');
      setTerminationReason('');
      setPassword('123');

      setAnnualLeaveBalance('21');

      setDocuments([
        { id: 'doc_1', title: 'الرقم القومي', fileUrl: '', fileType: 'image' },
        { id: 'doc_2', title: 'شهادة التخرج', fileUrl: '', fileType: 'image' },
        { id: 'doc_3', title: 'كارنيه النقابة', fileUrl: '', fileType: 'image' },
        { id: 'doc_4', title: 'العقد', fileUrl: '', fileType: 'image' }
      ]);
    }
    setCodeError('');
  }, [editingEmp, isOpen]);

  if (!isOpen) return null;

  // Handle unique code verification
  const handleCodeChange = (val) => {
    setCode(val);
    const cleanVal = val.trim().toLowerCase();
    if (!cleanVal) {
      setCodeError('');
      return;
    }
    const exists = allEmployees.some(
      (e) => ((e.code && e.code.trim().toLowerCase() === cleanVal) || (e.username && e.username.trim().toLowerCase() === cleanVal)) && 
             e.id !== (editingEmp ? editingEmp.id : null)
    );
    const branchConflict = branches.find(
      (b) => b.username && b.username.trim().toLowerCase() === cleanVal
    );
    if (exists) {
      setCodeError('⚠️ هذا الكود مستخدم بالفعل لموظف آخر');
    } else if (branchConflict) {
      setCodeError(`⚠️ هذا الكود مستخدم بالفعل كاسم مستخدم لفرع "${branchConflict.name}"`);
    } else {
      setCodeError('');
    }
  };

  // Handle document management
  const handleAddCustomDocument = () => {
    if (!newDocTitle.trim()) return;
    const newDoc = {
      id: `doc_${Date.now()}`,
      title: newDocTitle.trim(),
      fileUrl: '',
      fileType: 'image',
      fileName: ''
    };
    setDocuments((prevDocs) => [...prevDocs, newDoc]);
    setNewDocTitle('');
  };

  const handleDocFileUpload = async (e, docId) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const fileUrl = await compressImage(file, 1600, 0.85);
      setDocuments((prevDocs) =>
        prevDocs.map((d) =>
          d.id === docId
            ? {
                ...d,
                fileUrl,
                fileName: file.name,
                fileType: isPdf ? 'application/pdf' : (file.type || 'image/jpeg'),
                uploadedAt: new Date().toISOString(),
                driveFileId: null,
                driveViewLink: null,
                driveDownloadUrl: null
              }
            : d
        )
      );
    } catch (err) {
      console.error('Error reading/compressing doc file:', err);
    }
  };

  const handleDeleteDocument = (docId) => {
    setDocuments((prevDocs) => prevDocs.filter((d) => d.id !== docId));
  };

  const handleManualDriveSync = async () => {
    const driveConfig = state?.orgSettings?.driveConfig;
    if (!driveConfig || !driveConfig.enabled || !driveConfig.serviceUrl) {
      alert('⚠️ خدمة Google Drive غير مفعلة. يرجى تفعيلها وإدخال رابط الخدمة من شاشة الإعدادات ➔ أرشفة Google Drive.');
      return;
    }

    setIsDriveSyncing(true);
    setDriveSyncMsg('جاري الاتصال بـ Google Drive...');

    const validPhones = phones.filter(p => p.number && p.number.trim());
    const primaryPhone = validPhones[0]?.number || '';

    const empDataToSync = {
      id: currentEmp?.id || `emp_${Date.now()}`,
      name: name.trim(),
      code: code.trim(),
      jobTitle: jobTitle.trim(),
      department: department || 'الصيدلية',
      phone: primaryPhone,
      phones: validPhones,
      relativePhone: relativePhone.trim(),
      nationalId: nationalId.trim(),
      dob,
      address,
      photoUrl,
      maritalStatus,
      contractType,
      hireDate,
      status,
      annualLeaveBalance: parseFloat(annualLeaveBalance) || 21,
      branchesDetails,
      documents,
      driveFolderId,
      driveFolderUrl,
      biometricFolderId
    };

    const res = await syncEmployeeEntireDrive(empDataToSync, state.orgSettings, (msg) => setDriveSyncMsg(msg));
    setIsDriveSyncing(false);

    if (res.success && res.updatedEmp) {
      setDriveFolderId(res.updatedEmp.driveFolderId);
      setDriveFolderUrl(res.updatedEmp.driveFolderUrl);
      setBiometricFolderId(res.updatedEmp.biometricFolderId);
      setDocuments(res.updatedEmp.documents || documents);
      setDriveLastSyncAt(res.updatedEmp.driveLastSyncAt || new Date().toISOString());

      if (setState && state) {
        const updatedEmps = (state.employees || []).map(e => 
          String(e.id) === String(res.updatedEmp.id) ? res.updatedEmp : e
        );
        const updatedState = { ...state, employees: updatedEmps };
        setState(updatedState);
        if (saveState) saveState(updatedState);
      }
      if (showToast) showToast('✅ تمت مزامنة ملف الموظف ومستنداته وصور البصمة مع Google Drive بنجاح');
      else alert('✅ تمت مزامنة ملف الموظف ومستنداته وصور البصمة مع Google Drive بنجاح');
    } else {
      const errText = res.error || res.reason || 'تعذر استكمال المزامنة';
      if (showToast) showToast(`❌ فشل المزامنة: ${errText}`);
      else alert(`❌ فشل المزامنة: ${errText}`);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (codeError) {
      if (showToast) showToast('⚠️ يرجى تصحيح كود الموظف قبل الحفظ');
      else alert('يرجى تصحيح كود الموظف قبل الحفظ');
      return;
    }

    if (!name.trim()) {
      if (showToast) showToast('⚠️ يرجى إدخال اسم الموظف');
      else alert('يرجى إدخال اسم الموظف');
      return;
    }

    const cleanCode = String(code || '').trim().toLowerCase();
    if (!cleanCode) {
      if (showToast) showToast('⚠️ يرجى إدخال كود الموظف');
      else alert('يرجى إدخال كود الموظف');
      return;
    }

    // Double check duplicate employee code
    const isEmpDuplicate = allEmployees.some(
      (e) => ((e.code && String(e.code).trim().toLowerCase() === cleanCode) || (e.username && String(e.username).trim().toLowerCase() === cleanCode)) &&
             e.id !== (editingEmp ? editingEmp.id : null)
    );
    if (isEmpDuplicate) {
      if (showToast) showToast('⚠️ كود الموظف مستخدم بالفعل لموظف آخر');
      else alert('⚠️ كود الموظف مستخدم بالفعل لموظف آخر');
      return;
    }

    // Double check duplicate with any branch username
    const branchConflict = branches.find(
      (b) => b.username && String(b.username).trim().toLowerCase() === cleanCode
    );
    if (branchConflict) {
      const msg = `⚠️ لا يمكن استخدام هذا الكود لأنه مستخدم كاسم مستخدم لفرع "${branchConflict.name}"`;
      if (showToast) showToast(msg);
      else alert(msg);
      return;
    }

    // Clean valid branches details
    const validBranchesDetails = branchesDetails.filter(bd => bd.branchId && bd.branchId.trim()).map(bd => {
      const branchObj = branches.find(b => b.id === bd.branchId);
      const salary = parseFloat(bd.salary) || 0;
      const workHours = parseFloat(bd.workHours) || 8;
      const workDays = parseFloat(bd.workDays) || 26;
      const breakHours = parseFloat(bd.breakHours) || 0;
      return {
        branchId: bd.branchId,
        branchName: branchObj ? branchObj.name : 'فرع غير معروف',
        branchCode: branchObj ? branchObj.branchCode : '',
        salary: String(salary),
        workHoursPerDay: String(workHours),
        workDaysPerMonth: String(workDays),
        breakHours: String(breakHours),
        defaultBreakHours: breakHours
      };
    });

    const activeBranchIdsSet = new Set(validBranchesDetails.map(b => String(b.branchId)));

    // Clean valid archived branch details (excluding any currently active branch)
    const validArchivedBranchesDetails = archivedBranchesDetails
      .filter(ab => ab.branchId && !activeBranchIdsSet.has(String(ab.branchId)))
      .map(ab => {
        const branchObj = branches.find(b => String(b.id) === String(ab.branchId));
        return {
          branchId: ab.branchId,
          branchName: branchObj ? branchObj.name : (ab.branchName || 'فرع غير معروف'),
          branchCode: branchObj ? branchObj.branchCode : (ab.branchCode || ''),
          salary: String(ab.salary !== undefined && ab.salary !== null ? ab.salary : ''),
          workHoursPerDay: String(ab.workHours || ab.workHoursPerDay || '8'),
          workDaysPerMonth: String(ab.workDays || ab.workDaysPerMonth || '26'),
          breakHours: String(ab.breakHours || ab.defaultBreakHours || '0'),
          defaultBreakHours: parseFloat(ab.breakHours || ab.defaultBreakHours) || 0,
          archivedAt: ab.archivedAt || new Date().toISOString()
        };
      });

    const isTerminated = status === 'تم الاستقالة';
    if (isTerminated && !terminationReason.trim()) {
      if (showToast) showToast('⚠️ يرجى إدخال سبب الاستقالة / إنهاء الخدمة');
      else alert('يرجى إدخال سبب الاستقالة / إنهاء الخدمة');
      return;
    }

    const validPhones = phones
      .map((p, idx) => ({
        id: p.id || String(idx + 1),
        number: String(p.number || '').replace(/\D/g, '').trim(),
        type: p.type || 'mobile'
      }))
      .filter(p => p.number.length > 0);

    const primaryPhone = validPhones[0]?.number || (phone ? String(phone).replace(/\D/g, '').trim() : (editingEmp?.phone || ''));

    const isMgmt = isManagementJob(jobTitle, jobs);

    const validExtraAllowances = extraAllowances
      .filter(a => (parseFloat(a.amount) > 0) || (a.title && a.title.trim()))
      .map(a => ({
        id: a.id || Math.random().toString(),
        title: a.title?.trim() || 'أجر إضافي',
        amount: parseFloat(a.amount) || 0
      }));
    const totalExtraAllowance = validExtraAllowances.reduce((acc, a) => acc + (a.amount || 0), 0);
    const combinedExtraTitle = validExtraAllowances.map(a => a.title).join(' + ');

    const employeeData = {
      ...(editingEmp || {}),
      id: editingEmp && editingEmp.id && !editingEmp.isFromRecruitment ? editingEmp.id : `emp_${Date.now()}`,
      recruitmentApplicationId: editingEmp?.recruitmentApplicationId || editingEmp?.applicationId || undefined,
      isFromRecruitment: editingEmp?.isFromRecruitment || undefined,
      name: name.trim(),
      nickname: nickname.trim(),
      phone: primaryPhone,
      phones: validPhones.length > 0 ? validPhones : (primaryPhone ? [{ id: '1', type: 'mobile', number: primaryPhone }] : []),
      email: email.trim(),
      relativePhone: relativePhone.trim(),
      emergencyPhone: relativePhone.trim(),
      nationalId: nationalId.trim(),
      dob,
      address,
      photoUrl,
      maritalStatus,
      code,
      username: code,
      jobTitle: jobTitle.trim(),
      department: department || (departments[0] || 'الصيدلية'),
      // Allowances
      managementAllowance: isMgmt ? (parseFloat(managementAllowance) || 0) : 0,
      transportAllowance: parseFloat(transportAllowance) || 0,
      extraAllowances: validExtraAllowances,
      customAllowances: validExtraAllowances,
      extraAllowance: totalExtraAllowance,
      extraAllowanceTitle: combinedExtraTitle.trim(),
      // Daily Attendance Allowance (البدل اليومي المرتبط بالحضور الفعلي)
      dailyAllowanceAmount: (dailyAllowances.filter(a => (parseFloat(a.amount) || 0) > 0).length > 0)
        ? dailyAllowances.filter(a => (parseFloat(a.amount) || 0) > 0).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
        : (parseFloat(dailyAllowanceAmount) || 0),
      dailyAllowanceTitle: (dailyAllowances.filter(a => (parseFloat(a.amount) || 0) > 0).length > 0)
        ? dailyAllowances.filter(a => (parseFloat(a.amount) || 0) > 0).map(a => a.title?.trim() || 'بدل يومي').join(' + ')
        : (dailyAllowanceTitle.trim() || 'بدل يومي'),
      dailyAllowances: dailyAllowances
        .filter(a => (parseFloat(a.amount) > 0) || (a.title && a.title.trim()))
        .map(a => ({
          id: a.id || Math.random().toString(),
          title: a.title?.trim() || 'بدل يومي',
          amount: parseFloat(a.amount) || 0
        })),
      // For backwards compatibility and main branch logic, use the first branch's details
      branchId: validBranchesDetails[0]?.branchId || '',
      salary: validBranchesDetails[0]?.salary || '0',
      workHoursPerDay: validBranchesDetails[0]?.workHoursPerDay || '8',
      workDaysPerMonth: validBranchesDetails[0]?.workDaysPerMonth || '26',
      breakHours: validBranchesDetails[0]?.breakHours || '0',
      defaultBreakHours: validBranchesDetails[0]?.defaultBreakHours || 0,
      // Store all active branches details here
      branchesDetails: validBranchesDetails,
      // Store preserved/archived branch salaries here
      archivedBranchesDetails: validArchivedBranchesDetails,
      
      hireDate,
      contractType,
      status: isTerminated ? 'تم الاستقالة' : 'على رأس العمل',
      is_active: !isTerminated,
      fingerprint_active: !isTerminated,
      suspension_reason: isTerminated ? terminationReason.trim() : '',
      password,
      annualLeaveBalance: parseFloat(annualLeaveBalance) || 21,
      documents,
      driveFolderId,
      driveFolderUrl,
      biometricFolderId,
      driveLastSyncAt,
      updatedAt: new Date().toISOString(),
      createdAt: editingEmp?.createdAt || new Date().toISOString()
    };

    const performActualSave = async () => {
      if (isSaving) return;
      setIsSaving(true);
      try {
        if (onSave) {
          await onSave(employeeData);
        } else if (setState) {
          const currentState = state || {};
          const isExisting = (currentState.employees || []).some(e => String(e.id) === String(employeeData.id));
          let updatedEmps;
          if (isExisting) {
            updatedEmps = (currentState.employees || []).map(e => String(e.id) === String(employeeData.id) ? { ...e, ...employeeData } : e);
          } else {
            updatedEmps = [...(currentState.employees || []), employeeData];
          }
          const updatedState = { ...currentState, employees: updatedEmps };
          setState(updatedState);
          if (saveState) {
            const saveRes = await saveState(updatedState);
            if (saveRes && saveRes.success === false && saveRes.error) {
              console.warn('[EmployeeSave] Save returned warning:', saveRes.error);
            }
          }
        }

        if (showToast) {
          showToast(`✅ تم حفظ وتأمين ملف الموظف (${employeeData.name}) بنجاح`);
        }

        // Trigger auto background sync to Google Drive if configured
        const driveConfig = state?.orgSettings?.driveConfig;
        if (driveConfig && driveConfig.enabled && driveConfig.serviceUrl && driveConfig.autoSyncOnEmployeeSave !== false) {
          syncEmployeeEntireDrive(employeeData, state.orgSettings)
            .then((res) => {
              if (res.success && res.updatedEmp && setState && state) {
                const finalEmps = (state.employees || []).map(e => 
                  String(e.id) === String(res.updatedEmp.id) ? res.updatedEmp : e
                );
                const finalState = { ...state, employees: finalEmps };
                setState(finalState);
                if (saveState) saveState(finalState);
                if (showToast) showToast(`☁️ تم إنشاء/تحديث مجلد الموظف (${employeeData.name}) على Google Drive بنجاح`);
              }
            })
            .catch(err => console.warn('Background Google Drive sync error:', err));
        }

        onClose();
      } catch (err) {
        console.error('Save error:', err);
        if (showToast) {
          showToast('❌ حدث خطأ أثناء حفظ بيانات الموظف: ' + (err.message || 'يرجى المحاولة مجدداً'));
        } else {
          alert('❌ حدث خطأ أثناء حفظ بيانات الموظف: ' + (err.message || ''));
        }
      } finally {
        setIsSaving(false);
      }
    };

    // ── فحص أقفال المالك للتعديلات المالية والإدارية الحساسة ──
    const isOwnerSession = authRole === 'owner' || (() => {
      try {
        return localStorage.getItem('app_auth_role') === 'owner' ||
               localStorage.getItem('app_owner_authenticated') === 'true' ||
               sessionStorage.getItem('app_owner_authenticated') === 'true';
      } catch {
        return false;
      }
    })();

    if (isOwnerSession) {
      performActualSave();
      return;
    }

    const targetEmp = editingEmp || emp;
    const locks = state?.orgSettings?.ownerModificationLocks || {};

    let isSalaryChanged = false;
    let isAllowancesChanged = false;
    let isCutoffChanged = false;

    if (targetEmp && targetEmp.id && !targetEmp.isFromRecruitment) {
      // 1. فحص تغير الراتب الأساسي وسعر الساعة
      const oldSal = parseFloat(targetEmp.salary) || 0;
      const newSal = parseFloat(employeeData.salary) || 0;
      if (Math.abs(oldSal - newSal) > 0.01) {
        isSalaryChanged = true;
      }
      const oldBranches = Array.isArray(targetEmp.branchesDetails) ? targetEmp.branchesDetails : [];
      const newBranches = Array.isArray(employeeData.branchesDetails) ? employeeData.branchesDetails : [];
      for (const nb of newBranches) {
        const ob = oldBranches.find(b => String(b.branchId) === String(nb.branchId));
        const nbSal = parseFloat(nb.salary) || 0;
        const obSal = ob ? (parseFloat(ob.salary) || 0) : 0;
        if (Math.abs(nbSal - obSal) > 0.01) {
          isSalaryChanged = true;
          break;
        }
      }

      // 2. فحص تغير البدلات والأجور الإضافية
      const oldMgmt = parseFloat(targetEmp.managementAllowance) || 0;
      const newMgmt = parseFloat(employeeData.managementAllowance) || 0;
      const oldTrans = parseFloat(targetEmp.transportAllowance) || 0;
      const newTrans = parseFloat(employeeData.transportAllowance) || 0;
      const oldExtra = parseFloat(targetEmp.extraAllowance) || 0;
      const newExtra = parseFloat(employeeData.extraAllowance) || 0;
      if (Math.abs(oldMgmt - newMgmt) > 0.01 ||
          Math.abs(oldTrans - newTrans) > 0.01 ||
          Math.abs(oldExtra - newExtra) > 0.01) {
        isAllowancesChanged = true;
      }
      const oldExtraList = Array.isArray(targetEmp.extraAllowances) ? targetEmp.extraAllowances : [];
      const newExtraList = Array.isArray(employeeData.extraAllowances) ? employeeData.extraAllowances : [];
      if (oldExtraList.length !== newExtraList.length) {
        isAllowancesChanged = true;
      }

      // 3. فحص تغير ساعات وأيام العمل (دورة المرتبات والقواعد)
      const oldH = parseFloat(targetEmp.workHoursPerDay || targetEmp.workHours) || 8;
      const newH = parseFloat(employeeData.workHoursPerDay) || 8;
      const oldD = parseFloat(targetEmp.workDaysPerMonth || targetEmp.workDays) || 26;
      const newD = parseFloat(employeeData.workDaysPerMonth) || 26;
      if (Math.abs(oldH - newH) > 0.01 || Math.abs(oldD - newD) > 0.01) {
        isCutoffChanged = true;
      }
      for (const nb of newBranches) {
        const ob = oldBranches.find(b => String(b.branchId) === String(nb.branchId));
        if (ob) {
          const obH = parseFloat(ob.workHoursPerDay || ob.workHours) || 8;
          const nbH = parseFloat(nb.workHoursPerDay || nb.workHours) || 8;
          const obD = parseFloat(ob.workDaysPerMonth || ob.workDays) || 26;
          const nbD = parseFloat(nb.workDaysPerMonth || nb.workDays) || 26;
          if (Math.abs(obH - nbH) > 0.01 || Math.abs(obD - nbD) > 0.01) {
            isCutoffChanged = true;
            break;
          }
        }
      }
    }

    const isTerminatedChanged = isTerminated && targetEmp && targetEmp.status !== 'تم الاستقالة';

    const triggeredLocks = [];
    if (isSalaryChanged && Boolean(locks.lockEditSalary)) {
      triggeredLocks.push({
        key: 'lockEditSalary',
        title: 'الرواتب الأساسية وأجر الساعة',
        details: `تعديل الراتب الأساسي وسعر الساعة للموظف (${name.trim()}) إلى ${employeeData.salary} ج.م`
      });
    }
    if (isAllowancesChanged && Boolean(locks.lockEditAllowances)) {
      triggeredLocks.push({
        key: 'lockEditAllowances',
        title: 'البدلات والأجور الإضافية',
        details: `تعديل البدلات والأجور الإضافية الشهرية للموظف (${name.trim()})`
      });
    }
    if (isCutoffChanged && Boolean(locks.lockEditCutoffRules)) {
      triggeredLocks.push({
        key: 'lockEditCutoffRules',
        title: 'دورة وساعات/أيام العمل (26/25)',
        details: `تعديل ساعات/أيام العمل الشهرية للموظف (${name.trim()})`
      });
    }
    if (isTerminatedChanged && Boolean(locks.lockTerminateEmployee)) {
      triggeredLocks.push({
        key: 'lockTerminateEmployee',
        title: 'إنهاء الخدمة والاستقالة',
        details: `إنهاء خدمة واستقالة الموظف (${name.trim()})`
      });
    }

    if (triggeredLocks.length > 0 && executeWithOwnerGuard) {
      const primaryLock = triggeredLocks[0];
      const titles = triggeredLocks.map(t => t.title).join(' و ');
      executeWithOwnerGuard({
        lockKey: primaryLock.key,
        actionTitle: `قفل المالك: تعديل ${titles}`,
        actionDetails: triggeredLocks.map(t => t.details).join(' | '),
        onExecute: performActualSave
      });
      return;
    }

    performActualSave();
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 'min(940px, 96vw)',
          width: '95%',
          maxHeight: 'min(92vh, calc(100dvh - 28px))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '20px',
          boxShadow: '0 25px 60px -15px rgba(15, 23, 42, 0.3)'
        }}
      >
        {/* Modern Modal Header Pro */}
        <div className="modal-header-pro">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
                flexShrink: 0,
                boxShadow: '0 4px 14px rgba(13, 148, 136, 0.28)',
                overflow: 'hidden'
              }}
            >
              {photoUrl ? (
                <img src={photoUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                editingEmp?.isFromRecruitment ? '🎯' : (editingEmp?.id ? '📄' : '👤')
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3
                  style={{
                    fontFamily: 'Cairo',
                    fontSize: '17.5px',
                    fontWeight: 800,
                    margin: 0,
                    color: 'var(--text, #0f172a)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {editingEmp && editingEmp.isFromRecruitment
                    ? `إضافة وتعيين موظف: ${editingEmp.name}`
                    : editingEmp && editingEmp.id
                    ? `ملف الموظف: ${editingEmp.name}`
                    : 'إضافة ملف موظف جديد'}
                </h3>

                {editingEmp?.code && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      background: 'rgba(13, 148, 136, 0.1)',
                      color: 'var(--primary, #0d9488)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid rgba(13, 148, 136, 0.2)'
                    }}
                  >
                    كود: {editingEmp.code}
                  </span>
                )}
                {jobTitle && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      background: 'var(--surface-muted, #f1f5f9)',
                      color: 'var(--text-secondary, #64748b)',
                      padding: '2px 8px',
                      borderRadius: '6px'
                    }}
                  >
                    {jobTitle}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted, #64748b)', marginTop: '3px' }}>
                {editingEmp?.id ? 'السجل الوظيفي والمالي والمستندات الرسمية للموظف' : 'إنشاء وتجهيز ملف وظيفي متكامل بالمنظومة'}
              </div>
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="modal-close-circle-btn"
            title="إغلاق النافذة (Esc)"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        {/* Header Top Sub-Bar (Recruitment Banner + Tabs + Drive Sync) - NEVER SCROLLS */}
        <div style={{ padding: '14px 20px 0 20px', flexShrink: 0, overflow: 'visible' }}>
          {editingEmp && editingEmp.isFromRecruitment && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.08))',
                border: '1px solid #10b981',
                borderRadius: '10px',
                padding: '10px 14px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#065f46',
                fontSize: '12.5px',
                fontWeight: 700
              }}
            >
              <span style={{ fontSize: '18px' }}>✨</span>
              <span>تم استيراد البيانات الشخصية والمؤهلات والوثائق تلقائياً من بوابة التوظيف وطلب التعيين. يرجى استكمال بيانات الوظيفة والفرع والراتب لاعتماد تعيين الموظف.</span>
            </div>
          )}

          {/* Segmented Control Tab Navigation (Strictly Zero Vertical Scroll, 100% Full Visibility) */}
          <div className="modal-tabs-pro">
            <button
              type="button"
              className={`modal-tab-pill ${activeTab === 'personal' ? 'active' : ''}`}
              onClick={() => setActiveTab('personal')}
            >
              <span>👤</span>
              <span className="tab-label">1. البيانات الشخصية</span>
            </button>

            <button
              type="button"
              className={`modal-tab-pill ${activeTab === 'job' ? 'active' : ''}`}
              onClick={() => setActiveTab('job')}
            >
              <span>💼</span>
              <span className="tab-label">2. بيانات الوظيفة</span>
            </button>

            <button
              type="button"
              className={`modal-tab-pill ${activeTab === 'financial' ? 'active' : ''}`}
              onClick={() => setActiveTab('financial')}
            >
              <span>💳</span>
              <span className="tab-label">3. المالية وساعات العمل</span>
            </button>

            <button
              type="button"
              className={`modal-tab-pill ${activeTab === 'documents' ? 'active' : ''}`}
              onClick={() => setActiveTab('documents')}
            >
              <span>📁</span>
              <span className="tab-label">4. المستندات والوثائق</span>
              {documents.length > 0 && (
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 800,
                    background: activeTab === 'documents' ? '#ffffff' : 'var(--primary, #0d9488)',
                    color: activeTab === 'documents' ? 'var(--primary, #0d9488)' : '#ffffff',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    marginRight: '3px'
                  }}
                >
                  {documents.length}
                </span>
              )}
            </button>
          </div>

          {/* Google Drive Sync & Quick Access Bar */}
          {state?.orgSettings?.driveConfig?.enabled && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(135deg, rgba(66, 133, 244, 0.08), rgba(52, 168, 83, 0.08))',
                border: '1px solid rgba(66, 133, 244, 0.25)',
                borderRadius: '10px',
                padding: '8px 14px',
                marginBottom: '12px',
                fontSize: '12.5px',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>📁</span>
                <div>
                  <strong>Google Drive للموظف: </strong>
                  {driveFolderUrl ? (
                    <a
                      href={driveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#0284c7', fontWeight: 'bold', textDecoration: 'underline', marginRight: '6px' }}
                    >
                      فتح المجلد السحابي ↗
                    </a>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>سيتم إنشاء المجلد سحابياً عند الحفظ تلقائياً</span>
                  )}
                  {driveLastSyncAt && (
                    <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '1px' }}>
                      آخر مزامنة: {new Date(driveLastSyncAt).toLocaleString('ar-EG')}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isDriveSyncing ? (
                  <span style={{ color: '#0284c7', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }}></span>
                    {driveSyncMsg || 'جاري المزامنة مع Drive...'}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleManualDriveSync}
                    style={{
                      fontSize: '11.5px',
                      padding: '4px 10px',
                      background: '#fff',
                      border: '1px solid #93c5fd',
                      color: '#1d4ed8',
                      fontWeight: 'bold',
                      borderRadius: '8px'
                    }}
                  >
                    🔄 مزامنة درايف الآن
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0, padding: '6px 20px 16px 20px' }}>
          {/* TAB 1: Personal Data */}
          {activeTab === 'personal' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px dashed var(--primary)' }}>
                  {photoUrl ? (
                    <img src={photoUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '32px' }}>👤</span>
                  )}
                </div>
                <div>
                  <label className="btn btn-ghost" style={{ cursor: 'pointer', fontSize: '13px' }}>
                    📷 رفع صورة الموظف
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handlePhotoUpload}
                    />
                  </label>
                  {photoUrl && (
                    <button type="button" className="del-btn" style={{ marginLeft: '8px', fontSize: '12px' }} onClick={() => setPhotoUrl('')}>
                      حذف الصورة
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="field">
                  <label>الاسم بالكامل (الرسمي في مسير الرواتب والمفردات) *</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="اسم الموظف الثلاثي أو الرباعي الرسمي" />
                </div>

                <div className="field">
                  <label>اسم الشهرة (يظهر في جميع شاشات وصفحات النظام)</label>
                  <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="مثال: د. أحمد / دكتور كريم (اختياري)" />
                </div>

                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label>البريد الإلكتروني الشخصي (Gmail التنبيهات)</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="employee@gmail.com" />
                </div>

                {/* Multiple Phone Numbers Section */}
                <div className="field" style={{ gridColumn: 'span 2', background: 'var(--surface-muted)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label style={{ fontWeight: 800, margin: 0 }}>📞 أرقام الهواتف الشخصية والتواصل</label>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleAddPhoneField}
                      style={{ fontSize: '12px', padding: '4px 10px', background: 'var(--primary-light)', color: 'var(--primary-dark)', fontWeight: 'bold' }}
                    >
                      ➕ إضافة رقم هاتف آخر
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {phones.map((p, idx) => (
                      <div key={p.id || idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <select
                          value={p.type || 'mobile'}
                          onChange={(e) => handlePhoneChange(p.id, 'type', e.target.value)}
                          style={{ width: '130px', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '12.5px', fontWeight: 'bold' }}
                        >
                          <option value="mobile">📱 محمول</option>
                          <option value="whatsapp">💬 واتساب</option>
                          <option value="landline">☎️ خط أرضي</option>
                        </select>

                        <input
                          type="text"
                          placeholder="أرقام فقط (مثال: 01012345678)"
                          value={p.number}
                          onChange={(e) => handlePhoneChange(p.id, 'number', e.target.value)}
                          style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '13px', direction: 'ltr', textAlign: 'right' }}
                        />

                        {phones.length > 1 && (
                          <button
                            type="button"
                            className="del-btn"
                            onClick={() => handleRemovePhoneField(p.id)}
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                            title="حذف هذا الرقم"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                    * تقبل أرقام الهواتف الأرقام فقط (0-9). يمكنك تحديد نوع الرقم (محمول / واتساب / أرضي).
                  </div>
                </div>

                <div className="field">
                  <label>رقم هاتف قريب من الدرجة الأولى (للطوارئ)</label>
                  <input
                    type="text"
                    value={relativePhone}
                    onChange={(e) => setRelativePhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="01112345678 (أرقام فقط)"
                  />
                </div>

                <div className="field">
                  <label>الرقم القومي (14 رقم)</label>
                  <input
                    type="text"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
                    placeholder="29901010123456 (أرقام فقط)"
                  />
                </div>

                <div className="field">
                  <label>تاريخ الميلاد</label>
                  <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>

                <div className="field">
                  <label>الحالة الاجتماعية</label>
                  <select value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)}>
                    <option value="أعزب">أعزب</option>
                    <option value="متزوج">متزوج</option>
                    <option value="غير ذلك">غير ذلك</option>
                  </select>
                </div>

                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label>العنوان السكني</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="المدينة - الشارع - رقم المبنى" />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Job Data */}
          {activeTab === 'job' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label style={{ fontWeight: 'bold' }}>كود الموظف / اسم المستخدم للدخول (موحد وغير قابل للتكرار) *</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  style={codeError ? { borderColor: 'var(--danger)', borderWidth: '2px' } : {}}
                  placeholder="مثال: 101 أو emp_ahmed"
                  required
                />
                {codeError ? (
                  <span style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: 'bold', marginTop: '4px', display: 'block' }}>
                    {codeError}
                  </span>
                ) : code.trim() ? (
                  <span style={{ color: '#16a34a', fontSize: '11.5px', fontWeight: 'bold', marginTop: '4px', display: 'block' }}>
                    ✓ كود الموظف متاح وجاهز لتسجيل الدخول
                  </span>
                ) : null}
              </div>

              <div className="field">
                <label style={{ fontWeight: 'bold' }}>المسمى الوظيفي *</label>
                <select
                  value={jobTitle}
                  onChange={(e) => {
                    const newTitle = e.target.value;
                    setJobTitle(newTitle);
                    const matchedJob = effectiveJobs.find(j => j.title?.trim() === newTitle?.trim());
                    if (matchedJob && matchedJob.department) {
                      setDepartment(matchedJob.department);
                    }
                  }}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 'bold' }}
                  required
                >
                  <option value="">-- اختر المسمى الوظيفي --</option>
                  {effectiveJobs.map((j) => {
                    const isMgmt = isManagementJob(j.title, effectiveJobs);
                    return (
                      <option key={j.id || j.title} value={j.title}>
                        {isMgmt ? `👔 ${j.title} (إدارية)` : `🏬 ${j.title}`}
                      </option>
                    );
                  })}
                  {/* Keep current jobTitle if it was custom */}
                  {jobTitle && !effectiveJobs.some(j => j.title?.trim() === jobTitle.trim()) && (
                    <option value={jobTitle}>
                      📌 {jobTitle} (مخصص)
                    </option>
                  )}
                </select>

                {/* Job Classification Info Badge */}
                {jobTitle && (() => {
                  const isMgmt = isManagementJob(jobTitle, effectiveJobs);
                  return isMgmt ? (
                    <div style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', padding: '6px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 'bold', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      👔 وظيفة إدارية: تمنح الموظف أحقية صرف بدل الإدارة وتوجه كافة طلباته للإدارة العليا مباشرة.
                    </div>
                  ) : (
                    <div style={{ background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '6px', fontSize: '11.5px', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🏬 كادر تشغيلي / فني.
                    </div>
                  );
                })()}
              </div>

              <div className="field">
                <label style={{ fontWeight: 'bold' }}>القسم *</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 'bold' }}
                  required
                >
                  <option value="">-- اختر القسم --</option>
                  {effectiveDepartments.map((d) => (
                    <option key={d} value={d}>
                      🏢 {d}
                    </option>
                  ))}
                  {department && !effectiveDepartments.includes(department) && (
                    <option value={department}>
                      📌 {department} (مخصص)
                    </option>
                  )}
                </select>
              </div>

              <div className="field" style={{ gridColumn: 'span 2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>الفروع المعين بها (متعدد الفروع)</label>
                  <button 
                    type="button" 
                    className="btn btn-ghost" 
                    style={{ fontSize: '12px' }}
                    onClick={() => {
                      setBranchesDetails([...branchesDetails, { id: Math.random().toString(), branchId: '', salary: '', workHours: '', workDays: '', breakHours: '' }]);
                    }}
                  >
                    ➕ إضافة فرع آخر
                  </button>
                </div>
                
                {branchesDetails.map((bd, idx) => (
                  <div key={bd.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    <select 
                      value={bd.branchId} 
                      onChange={(e) => handleBranchSelectChange(idx, e.target.value)}
                      style={{ flex: 1 }}
                    >
                      <option value="">-- اختر الفرع --</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.branchCode})
                        </option>
                      ))}
                    </select>
                    {branchesDetails.length > 1 && (
                      <button 
                        type="button" 
                        className="del-btn" 
                        style={{ padding: '6px' }}
                        title="إزالة الفرع من الفروع المعين بها الموظف (سيتم حفظ بيانات الراتب بالأرشيف المالي)"
                        onClick={() => handleRemoveActiveBranch(idx)}
                      >
                        ❌
                      </button>
                    )}
                  </div>
                ))}

                {archivedBranchesDetails.length > 0 && (
                  <div style={{ marginTop: '8px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', fontSize: '12px', color: '#475569', lineHeight: '1.6' }}>
                    💡 <strong>فروع سابقة محفوظة مالياً:</strong>{' '}
                    {archivedBranchesDetails.map(ab => ab.branchName || branches.find(b => String(b.id) === String(ab.branchId))?.name).filter(Boolean).join('، ')}
                    <br />
                    <span style={{ color: '#0284c7' }}>
                      (عند اختيار أي من هذه الفروع في القائمة أعلاه سيتم تفعيل واسترجاع تفاصيل راتبه وساعاته تلقائياً فوراً).
                    </span>
                  </div>
                )}
              </div>

              <div className="field">
                <label>تاريخ التعيين</label>
                <input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              </div>

              <div className="field">
                <label>نوع العقد</label>
                <select value={contractType} onChange={(e) => setContractType(e.target.value)}>
                  <option value="دوام كامل">دوام كامل (Full-Time)</option>
                  <option value="دوام جزئي">دوام جزئي (Part-Time)</option>
                  <option value="مؤقت">عقد مؤقت</option>
                </select>
              </div>

              <div className="field">
                <label>حالة الموظف</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="على رأس العمل">🟢 على رأس العمل</option>
                  <option value="تم الاستقالة">🔴 تم الاستقالة / إنهاء الخدمة</option>
                </select>
              </div>

              {status === 'تم الاستقالة' && (
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label style={{ color: 'var(--danger-dark)', fontWeight: 'bold' }}>سبب الإيقاف / إنهاء الخدمة</label>
                  <textarea
                    value={terminationReason}
                    onChange={(e) => setTerminationReason(e.target.value)}
                    placeholder="اكتب سبب تغيير الحالة وإيقاف الحساب"
                    required
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--danger-light)', minHeight: '60px' }}
                  />
                </div>
              )}

              <div className="field">
                <label>رصيد الإجازات السنوية (يوم)</label>
                <input
                  type="number"
                  min="0"
                  value={annualLeaveBalance}
                  onChange={(e) => setAnnualLeaveBalance(e.target.value)}
                  placeholder="21"
                />
              </div>

              {/* ── قسم تعيين نظام الدخول للموظف ── */}
              <div
                style={{
                  gridColumn: 'span 2',
                  marginTop: '10px',
                  padding: '16px',
                  background: 'var(--primary-tint)',
                  borderRadius: '12px',
                  border: '1px solid var(--primary-dark)'
                }}
              >
                <h4 style={{ margin: '0 0 8px 0', fontFamily: 'Cairo', color: 'var(--primary-dark)' }}>
                  🔑 تعيين نظام الدخول والحساب للموظف
                </h4>
                <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: 'var(--muted)' }}>
                  يستخدم الموظف الكود الموحد الخاص به وكلمة المرور لتسجيل الدخول إلى صفحة الموظف وبوابة الحضور والبصمة.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="field">
                    <label>اسم المستخدم للدخول (كود الموظف)</label>
                    <input
                      type="text"
                      value={code}
                      readOnly
                      style={{ background: 'var(--surface)', fontWeight: 'bold' }}
                    />
                  </div>

                  <div className="field">
                    <label>كلمة المرور الخاصة بالمواصفة</label>
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="123"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Financial & Work Schedule */}
          {activeTab === 'financial' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {Boolean(state?.orgSettings?.ownerModificationLocks?.lockEditSalary || state?.orgSettings?.ownerModificationLocks?.lockEditAllowances || state?.orgSettings?.ownerModificationLocks?.lockEditCutoffRules) && (
                <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', color: '#92400e', fontSize: '13px', fontWeight: 700 }}>
                  <span style={{ fontSize: '18px' }}>🔒</span>
                  <span>تنبيه أمان المالك: تعديل الرواتب الأساسية أو البدلات أو دورة العمل محمي بقفل المالك. سيتطلب حفظ أي تعديل تصريحاً بكلمة مرور المالك.</span>
                </div>
              )}

              
              {/* Active Branches Financial Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontFamily: 'Cairo', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🟢 بيانات وأجور الفروع المعين بها الموظف حالياً ({branchesDetails.filter(bd => bd.branchId).length})
                </h4>

                {branchesDetails.map((bd, idx) => {
                  const branchName = branches.find(b => b.id === bd.branchId)?.name || `فرع غير محدد (${idx + 1})`;
                  const rateVal = parseFloat(bd.salary) || 0;
                  const hoursVal = parseFloat(bd.workHours) || 0;
                  const daysVal = parseFloat(bd.workDays) || 0;
                  const breakVal = parseFloat(bd.breakHours) || 0;
                  const netHoursVal = Math.max(0, hoursVal - breakVal);

                  let calcDailyRate = 0;
                  let calcDailyHourlyRate = 0;
                  let calcMonthlySalary = 0;

                  if (rateVal > 0 && daysVal > 0 && hoursVal > 0) {
                    // 1. سعر اليوم = (سعر الساعة الشهري * ساعات العمل) / أيام العمل
                    calcDailyRate = Math.round(((rateVal * hoursVal) / daysVal) * 100) / 100;
                    // 2. سعر الساعة اليومي الصافي = سعر اليوم / صافي ساعات العمل الفعلية
                    const effectiveHours = netHoursVal > 0 ? netHoursVal : hoursVal;
                    calcDailyHourlyRate = Math.round((calcDailyRate / effectiveHours) * 100) / 100;
                    // 3. الراتب الأساسي الشهري = سعر الساعة الشهري * ساعات العمل
                    calcMonthlySalary = Math.round(rateVal * hoursVal * 100) / 100;
                  }

                  return (
                    <div key={bd.id} style={{ background: 'var(--primary-tint)', padding: '16px', borderRadius: '12px', border: '1.5px solid var(--primary-light, #bfdbfe)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontFamily: 'Cairo', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          💰 بيانات وأجور: {branchName}
                        </h4>
                        <span className="badge badge-success" style={{ fontSize: '11.5px' }}>🟢 فرع نشط ومعين</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                        <div className="field">
                          <label style={{ fontWeight: 700, fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                            <span>💰</span>
                            <span>سعر الساعة الشهري (الراتب الأساسي)</span>
                          </label>
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input
                              type="number"
                              value={bd.salary !== undefined ? bd.salary : ''}
                              onChange={(e) => {
                                const newBd = [...branchesDetails];
                                newBd[idx].salary = e.target.value;
                                setBranchesDetails(newBd);
                              }}
                              placeholder="650"
                              required
                              style={{ paddingLeft: '42px', fontWeight: 'bold', fontSize: '14.5px', height: '42px', borderRadius: '8px', border: '1.5px solid #cbd5e1' }}
                            />
                            <span style={{ position: 'absolute', left: '10px', fontSize: '11px', color: '#64748b', fontWeight: 600, pointerEvents: 'none' }}>ج.م</span>
                          </div>
                        </div>

                        <div className="field">
                          <label style={{ fontWeight: 700, fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                            <span>⏱️</span>
                            <span>ساعات العمل اليومية</span>
                          </label>
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input
                              type="number"
                              value={bd.workHours !== undefined ? bd.workHours : ''}
                              onChange={(e) => {
                                const newBd = [...branchesDetails];
                                newBd[idx].workHours = e.target.value;
                                setBranchesDetails(newBd);
                              }}
                              placeholder="8"
                              required
                              style={{ paddingLeft: '40px', fontWeight: 'bold', fontSize: '14.5px', height: '42px', borderRadius: '8px', border: '1.5px solid #cbd5e1' }}
                            />
                            <span style={{ position: 'absolute', left: '10px', fontSize: '11px', color: '#64748b', fontWeight: 600, pointerEvents: 'none' }}>ساعة</span>
                          </div>
                        </div>

                        <div className="field">
                          <label style={{ fontWeight: 700, fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                            <span>📅</span>
                            <span>أيام العمل الشهرية</span>
                          </label>
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input
                              type="number"
                              value={bd.workDays !== undefined ? bd.workDays : ''}
                              onChange={(e) => {
                                const newBd = [...branchesDetails];
                                newBd[idx].workDays = e.target.value;
                                setBranchesDetails(newBd);
                              }}
                              placeholder="26"
                              required
                              style={{ paddingLeft: '38px', fontWeight: 'bold', fontSize: '14.5px', height: '42px', borderRadius: '8px', border: '1.5px solid #cbd5e1' }}
                            />
                            <span style={{ position: 'absolute', left: '10px', fontSize: '11px', color: '#64748b', fontWeight: 600, pointerEvents: 'none' }}>يوم</span>
                          </div>
                        </div>

                        <div className="field">
                          <label style={{ fontWeight: 700, fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                            <span>☕</span>
                            <span>ساعات البريك اليومية</span>
                          </label>
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input
                              type="number"
                              step="0.25"
                              min="0"
                              max="12"
                              value={bd.breakHours !== undefined ? bd.breakHours : ''}
                              onChange={(e) => {
                                const newBd = [...branchesDetails];
                                newBd[idx].breakHours = e.target.value;
                                setBranchesDetails(newBd);
                              }}
                              placeholder="0"
                              style={{ paddingLeft: '38px', fontWeight: 'bold', fontSize: '14.5px', height: '42px', borderRadius: '8px', border: '1.5px solid #cbd5e1' }}
                            />
                            <span style={{ position: 'absolute', left: '10px', fontSize: '11px', color: '#64748b', fontWeight: 600, pointerEvents: 'none' }}>ساعة</span>
                          </div>
                        </div>
                      </div>

                      {/* KPI Summary Cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginTop: '12px' }}>
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11.5px', color: '#1e40af', fontWeight: 600 }}>الراتب الأساسي الشهري</div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#1d4ed8', marginTop: '2px' }}>
                            {calcMonthlySalary > 0 ? `${calcMonthlySalary.toLocaleString()} ج.م` : '0 ج.م'}
                          </div>
                        </div>

                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11.5px', color: '#166534', fontWeight: 600 }}>سعر اليوم المعتمد</div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
                            {calcDailyRate > 0 ? `${calcDailyRate.toLocaleString()} ج.م / يوم` : '0 ج.م'}
                          </div>
                        </div>

                        <div style={{ background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: '10px', padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11.5px', color: '#155e75', fontWeight: 600 }}>سعر الساعة الصافي</div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#0e7490', marginTop: '2px' }}>
                            {calcDailyHourlyRate > 0 ? `${calcDailyHourlyRate.toLocaleString()} ج.م / س` : '0 ج.م'}
                          </div>
                        </div>

                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11.5px', color: '#92400e', fontWeight: 600 }}>ساعات البريك</div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>
                            {breakVal > 0 ? `${breakVal} ساعة` : '0 س (بدون)'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Inactive / Archived Branches Financial Cards (Read-only + Permanent Delete) */}
              {archivedBranchesDetails.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '12px 16px' }}>
                    <h4 style={{ margin: '0 0 4px 0', color: '#b45309', fontFamily: 'Cairo', fontSize: '14.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      🔒 رواتب الفروع السابقة (غير مرتبط بالموظف حالياً)
                    </h4>
                    <p style={{ margin: 0, fontSize: '12px', color: '#92400e', lineHeight: '1.6' }}>
                      تمت إزالة الموظف من هذه الفروع، لذلك فإن بيانات الراتب وساعات العمل محفوظة وموقوفة <strong>(غير قابلة للتعديل)</strong> ولا تدخل في احتساب المستحقات الحالية. عند إعادة تعيين الموظف بنفس الفرع سيتم تفعيل الراتب تلقائياً، أو يمكنك حذف هذا السجل نهائياً.
                    </p>
                  </div>

                  {archivedBranchesDetails.map((ab) => {
                    const branchName = ab.branchName || branches.find(b => String(b.id) === String(ab.branchId))?.name || 'فرع غير معروف';
                    const rateVal = parseFloat(ab.salary) || 0;
                    const hoursVal = parseFloat(ab.workHours || ab.workHoursPerDay) || 0;
                    const daysVal = parseFloat(ab.workDays || ab.workDaysPerMonth) || 0;
                    const breakVal = parseFloat(ab.breakHours || ab.defaultBreakHours) || 0;
                    const netHoursVal = Math.max(0, hoursVal - breakVal);

                    let calcDailyRate = 0;
                    let calcDailyHourlyRate = 0;
                    let calcMonthlySalary = 0;

                    if (rateVal > 0 && daysVal > 0 && hoursVal > 0) {
                      calcDailyRate = Math.round(((rateVal * hoursVal) / daysVal) * 100) / 100;
                      const effectiveHours = netHoursVal > 0 ? netHoursVal : hoursVal;
                      calcDailyHourlyRate = Math.round((calcDailyRate / effectiveHours) * 100) / 100;
                      calcMonthlySalary = Math.round(rateVal * hoursVal * 100) / 100;
                    }

                    return (
                      <div
                        key={ab.id || ab.branchId}
                        style={{
                          background: '#f8fafc',
                          padding: '16px',
                          borderRadius: '12px',
                          border: '1.5px dashed #cbd5e1',
                          opacity: 0.96
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '16px' }}>🏢</span>
                            <h4 style={{ margin: 0, color: '#475569', fontFamily: 'Cairo', fontSize: '14px' }}>
                              {branchName}
                            </h4>
                            <span style={{ background: '#f1f5f9', color: '#64748b', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', border: '1px solid #e2e8f0' }}>
                              🔒 غير نشط - للقراءة فقط
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteArchivedBranch(ab.branchId)}
                            style={{
                              background: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s ease'
                            }}
                            title="حذف سجل راتب هذا الفرع نهائياً"
                          >
                            🗑️ حذف الراتب نهائياً
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
                          <div className="field">
                            <label style={{ color: '#64748b', fontSize: '12px' }}>سعر الساعة الشهري (محفوظ)</label>
                            <input
                              type="number"
                              value={ab.salary !== undefined ? ab.salary : ''}
                              disabled
                              readOnly
                              style={{
                                background: '#f1f5f9',
                                color: '#64748b',
                                borderColor: '#e2e8f0',
                                cursor: 'not-allowed',
                                fontWeight: 'bold'
                              }}
                            />
                          </div>

                          <div className="field">
                            <label style={{ color: '#64748b', fontSize: '12px' }}>ساعات العمل اليومية (محفوظة)</label>
                            <input
                              type="number"
                              value={ab.workHours || ab.workHoursPerDay || ''}
                              disabled
                              readOnly
                              style={{
                                background: '#f1f5f9',
                                color: '#64748b',
                                borderColor: '#e2e8f0',
                                cursor: 'not-allowed',
                                fontWeight: 'bold'
                              }}
                            />
                          </div>

                          <div className="field">
                            <label style={{ color: '#64748b', fontSize: '12px' }}>أيام العمل الشهرية (محفوظة)</label>
                            <input
                              type="number"
                              value={ab.workDays || ab.workDaysPerMonth || ''}
                              disabled
                              readOnly
                              style={{
                                background: '#f1f5f9',
                                color: '#64748b',
                                borderColor: '#e2e8f0',
                                cursor: 'not-allowed',
                                fontWeight: 'bold'
                              }}
                            />
                          </div>

                          <div className="field">
                            <label style={{ color: '#64748b', fontSize: '12px' }}>ساعات البريك (محفوظة)</label>
                            <input
                              type="number"
                              value={ab.breakHours !== undefined ? ab.breakHours : ''}
                              disabled
                              readOnly
                              style={{
                                background: '#f1f5f9',
                                color: '#64748b',
                                borderColor: '#e2e8f0',
                                cursor: 'not-allowed',
                                fontWeight: 'bold'
                              }}
                            />
                          </div>
                        </div>

                        <div style={{ marginTop: '10px', padding: '8px 12px', background: '#f1f5f9', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#475569', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                          <span>📅 سعر اليوم المحفوظ: <strong>{calcDailyRate > 0 ? `${calcDailyRate.toLocaleString()} ج.م` : '0 ج.م'}</strong></span>
                          <span>💵 سعر الساعة: <strong>{calcDailyHourlyRate > 0 ? `${calcDailyHourlyRate.toLocaleString()} ج.م` : '0 ج.م'}</strong></span>
                          <span>💰 الراتب الأساسي: <strong>{calcMonthlySalary > 0 ? `${calcMonthlySalary.toLocaleString()} ج.م` : '0 ج.م'}</strong></span>
                          <span style={{ color: '#0284c7', fontWeight: 'bold' }}>ℹ️ لإعادة التفعيل: أضف الفرع للموظف</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── قسم البدلات والأجور الإضافية الشهرية الثابتة ── */}
              {(() => {
                const isMgmt = isManagementJob(jobTitle, jobs);
                const baseMonthly = branchesDetails.reduce((acc, bd) => {
                  const rateVal = parseFloat(bd.salary) || 0;
                  const hoursVal = parseFloat(bd.workHours) || 8;
                  return acc + Math.round(rateVal * hoursVal * 100) / 100;
                }, 0);

                const mgmtVal = isMgmt ? (parseFloat(managementAllowance) || 0) : 0;
                const transVal = parseFloat(transportAllowance) || 0;
                const extraListSum = extraAllowances.reduce((acc, a) => acc + (parseFloat(a.amount) || 0), 0);
                const totalAllowances = mgmtVal + transVal + extraListSum;
                const totalEstimatedCompensation = baseMonthly + totalAllowances;

                return (
                  <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '14px', border: '1.5px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <h4 style={{ margin: 0, color: 'var(--primary-dark)', fontFamily: 'Cairo', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      💵 البدلات الشهرية الثابتة والأجور الإضافية
                    </h4>
                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--muted)' }}>
                      يتم إضافة هذه البدلات تلقائياً إلى مستحقات الموظف في مسير الرواتب الشهري وكشف الحساب الرسمي.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                      {/* 1. بدل إدارة (ديناميكي: يظهر عند اختيار وظيفة إدارية) */}
                      {isMgmt ? (
                        <div className="field" style={{ background: '#f0fdf4', padding: '12px', borderRadius: '10px', border: '1px solid #86efac' }}>
                          <label style={{ color: '#166534', fontWeight: 'bold' }}>
                            👔 بدل إدارة (شهري) *
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={managementAllowance}
                            onChange={(e) => setManagementAllowance(e.target.value)}
                            placeholder="0"
                            style={{ background: '#fff', borderColor: '#86efac', fontWeight: 'bold', color: '#15803d' }}
                          />
                          <span style={{ fontSize: '11px', color: '#166534', marginTop: '4px', display: 'block' }}>
                            * يظهر لأن الموظف يشغل وظيفة إدارية ({jobTitle}).
                          </span>
                        </div>
                      ) : (
                        <div className="field" style={{ opacity: 0.6, background: '#f1f5f9', padding: '12px', borderRadius: '10px', border: '1px dashed #cbd5e1' }}>
                          <label style={{ color: '#64748b' }}>
                            👔 بدل إدارة
                          </label>
                          <input
                            type="text"
                            value="غير متاح (وظيفة غير إدارية)"
                            disabled
                            style={{ background: '#e2e8f0', color: '#64748b', cursor: 'not-allowed' }}
                          />
                          <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                            * يتاح فقط عند اختيار وظيفة إدارية في بيانات الوظيفة.
                          </span>
                        </div>
                      )}

                      {/* 2. بدل مواصلات (حقل ثابت) */}
                      <div className="field" style={{ background: '#eff6ff', padding: '12px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                        <label style={{ color: '#1e40af', fontWeight: 'bold' }}>
                          🚗 بدل مواصلات (شهري ثابت)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={transportAllowance}
                          onChange={(e) => setTransportAllowance(e.target.value)}
                          placeholder="0"
                          style={{ background: '#fff', borderColor: '#bfdbfe', fontWeight: 'bold', color: '#1d4ed8' }}
                        />
                        <span style={{ fontSize: '11px', color: '#1e40af', marginTop: '4px', display: 'block' }}>
                          * يضاف إلى مفردات الراتب تحت بند (بدل المواصلات).
                        </span>
                      </div>
                    </div>

                    {/* 3. الأجور والبدلات الإضافية المخصصة (متعددة بديناميكية +) */}
                    <div style={{ background: '#faf5ff', padding: '14px', borderRadius: '12px', border: '1px solid #e9d5ff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <label style={{ color: '#6b21a8', fontWeight: 'bold', margin: 0, fontSize: '14px' }}>
                            🏷️ الأجور والبدلات الإضافية المخصصة (حوافز / بدلات مخصصة)
                          </label>
                          <p style={{ margin: '2px 0 0 0', fontSize: '11.5px', color: '#7e22ce' }}>
                            يمكنك إضافة أكثر من مسمى للأجر الإضافي بقيمته لتظهر مفصلة في نظام أجور الموظف وكشوف الحساب.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={handleAddExtraAllowance}
                          style={{
                            background: '#f3e8ff',
                            color: '#6b21a8',
                            border: '1px solid #d8b4fe',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            padding: '4px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          ➕ إضافة أجر إضافي آخر
                        </button>
                      </div>

                      {extraAllowances.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '12px', background: '#fff', borderRadius: '8px', border: '1px dashed #d8b4fe', color: '#6b21a8', fontSize: '12.5px' }}>
                          لا توجد أجور إضافية مخصصة لهذا الموظف. انقر على <strong>(➕ إضافة أجر إضافي آخر)</strong> لإضافة حافز أو بدل مخصص.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {extraAllowances.map((ea, idx) => (
                            <div key={ea.id || idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#fff', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                              <div style={{ flex: 1 }}>
                                <input
                                  type="text"
                                  placeholder="مسمى الأجر (مثال: حافز تميز / بدل سكن / بدل مخاطر)"
                                  value={ea.title}
                                  onChange={(e) => handleExtraAllowanceChange(ea.id, 'title', e.target.value)}
                                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #d8b4fe', fontSize: '13px', background: '#faf5ff' }}
                                />
                              </div>
                              <div style={{ width: '160px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder="القيمة ج.م"
                                  value={ea.amount}
                                  onChange={(e) => handleExtraAllowanceChange(ea.id, 'amount', e.target.value)}
                                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #d8b4fe', fontSize: '13px', fontWeight: 'bold', color: '#7e22ce', background: '#fff' }}
                                />
                              </div>
                              <button
                                type="button"
                                className="del-btn"
                                onClick={() => handleRemoveExtraAllowance(ea.id)}
                                style={{ padding: '6px 10px', fontSize: '12px' }}
                                title="حذف هذا البند"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 4. البدل اليومي المرتبط ببصمة الدخول (Daily Attendance Allowance) */}
                    <div style={{ background: '#ecfdf5', padding: '16px', borderRadius: '12px', border: '1.5px solid #6ee7b7', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <label style={{ color: '#065f46', fontWeight: 'bold', margin: 0, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>📅</span>
                            <span>البدل اليومي المرتبط ببصمة الدخول (Daily Attendance Allowance)</span>
                          </label>
                          <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#047857' }}>
                            يتم احتساب هذا البدل آلياً في كشف الراتب بضرب (عدد أيام الحضور المسجلة ببصمة دخول × قيمة البدل اليومي)، ولا يُصرف في أيام الغياب.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={handleAddDailyAllowance}
                          style={{
                            background: '#d1fae5',
                            color: '#065f46',
                            border: '1px solid #a7f3d0',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            padding: '4px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          ➕ إضافة بدل يومي مخصص
                        </button>
                      </div>

                      {/* Main / Default Daily Allowance inputs */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label style={{ color: '#065f46', fontWeight: 'bold', fontSize: '12px' }}>
                            🏷️ مسمى البدل اليومي
                          </label>
                          <input
                            type="text"
                            placeholder="مثال: بدل انتقال يومي / بدل وجبة / بدل يومي"
                            value={dailyAllowanceTitle}
                            onChange={(e) => setDailyAllowanceTitle(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #6ee7b7', fontSize: '13px', background: '#f0fdf4', fontWeight: 'bold' }}
                          />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label style={{ color: '#065f46', fontWeight: 'bold', fontSize: '12px' }}>
                            💰 قيمة البدل لليوم الواحد (ج.م / يوم)
                          </label>
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0"
                              value={dailyAllowanceAmount}
                              onChange={(e) => setDailyAllowanceAmount(e.target.value)}
                              style={{ width: '100%', padding: '8px 10px', paddingLeft: '65px', borderRadius: '6px', border: '1px solid #6ee7b7', fontSize: '14px', fontWeight: 'bold', color: '#047857', background: '#fff' }}
                            />
                            <span style={{ position: 'absolute', left: '10px', fontSize: '11px', color: '#059669', fontWeight: 'bold', pointerEvents: 'none' }}>ج.م / يوم</span>
                          </div>
                        </div>
                      </div>

                      {/* Extra Daily Allowances if any */}
                      {dailyAllowances.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#065f46' }}>
                            📌 بدلات يومية إضافية مخصصة:
                          </div>
                          {dailyAllowances.map((da, idx) => (
                            <div key={da.id || idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#fff', padding: '8px 10px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                              <div style={{ flex: 1 }}>
                                <input
                                  type="text"
                                  placeholder="مسمى البدل اليومي الإضافي"
                                  value={da.title}
                                  onChange={(e) => handleDailyAllowanceChange(da.id, 'title', e.target.value)}
                                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #6ee7b7', fontSize: '13px', background: '#f0fdf4' }}
                                />
                              </div>
                              <div style={{ width: '170px', position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder="0"
                                  value={da.amount}
                                  onChange={(e) => handleDailyAllowanceChange(da.id, 'amount', e.target.value)}
                                  style={{ width: '100%', padding: '7px 10px', paddingLeft: '55px', borderRadius: '6px', border: '1px solid #6ee7b7', fontSize: '13px', fontWeight: 'bold', color: '#047857', background: '#fff' }}
                                />
                                <span style={{ position: 'absolute', left: '8px', fontSize: '10.5px', color: '#059669', fontWeight: 'bold', pointerEvents: 'none' }}>ج.م / يوم</span>
                              </div>
                              <button
                                type="button"
                                className="del-btn"
                                onClick={() => handleRemoveDailyAllowance(da.id)}
                                style={{ padding: '6px 10px', fontSize: '12px' }}
                                title="حذف هذا البدل اليومي"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ fontSize: '11.5px', color: '#065f46', background: 'rgba(255,255,255,0.7)', padding: '6px 10px', borderRadius: '6px', border: '1px dashed #6ee7b7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>💡</span>
                        <span>
                          <strong>تطبيق عملي:</strong> في حال كان إجمالي البدل اليومي <strong>{(parseFloat(dailyAllowanceAmount) || 0) + dailyAllowances.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)} ج.م/يوم</strong> وسجل الموظف <strong>20 يوم حضور</strong> بالبصمة، سيتم صرف <strong>{((parseFloat(dailyAllowanceAmount) || 0) + dailyAllowances.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)) * 20} ج.م</strong> تلقائياً في كشف الراتب.
                        </span>
                      </div>
                    </div>

                    {/* Live Total Compensation Card */}
                    <div style={{ background: '#0f766e', color: '#fff', padding: '12px 16px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '14px', fontSize: '13px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>الأساسي: <strong>{baseMonthly.toLocaleString()} ج.م</strong></span>
                        {mgmtVal > 0 && <span>+ بدل إدارة: <strong>+{mgmtVal.toLocaleString()} ج.م</strong></span>}
                        {transVal > 0 && <span>+ بدل مواصلات: <strong>+{transVal.toLocaleString()} ج.م</strong></span>}
                        {extraAllowances.filter(a => parseFloat(a.amount) > 0).map((a, i) => (
                          <span key={a.id || i} style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '6px' }}>
                            + {a.title || 'أجر إضافي'}: <strong>+{parseFloat(a.amount).toLocaleString()} ج.م</strong>
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', background: 'rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '8px' }}>
                        💰 إجمالي الاستحقاق الشهري التقديري: {totalEstimatedCompensation.toLocaleString()} ج.م
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 4: Documents & Attachments */}
          {activeTab === 'documents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                * يمكنك إرفاق مستندات الموظف (صور أو ملفات PDF) ومعاينتها في أي وقت. لا يشترط تواجدها لحفظ الملف.
              </p>

              {/* Add Custom Document Form */}
              <div style={{ display: 'flex', gap: '10px', background: 'var(--primary-tint)', padding: '12px', borderRadius: '12px' }}>
                <input
                  type="text"
                  placeholder="اسم مستند جديد (مثال: فيش وتشبيه / شهادة المعاملة)"
                  value={newDocTitle}
                  onChange={(e) => setNewDocTitle(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn btn-start" onClick={handleAddCustomDocument}>
                  ➕ إضافة مستند
                </button>
              </div>

              {/* Documents Table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--text)' }}>📄 {doc.title}</span>
                      {doc.fileName && (
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          ({doc.fileName})
                        </span>
                      )}
                      {doc.driveViewLink && (
                        <a
                          href={doc.driveViewLink}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: '11px',
                            background: 'rgba(52, 168, 83, 0.12)',
                            color: '#15803d',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            textDecoration: 'none'
                          }}
                          title="عرض المستند على Google Drive"
                        >
                          ☁️ محفوظ بدرايف ↗
                        </a>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <label className="btn btn-ghost" style={{ cursor: 'pointer', fontSize: '12px' }}>
                        {doc.fileUrl ? '🔄 استبدال' : '📤 رفع مستند'}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          style={{ display: 'none' }}
                          onChange={(e) => handleDocFileUpload(e, doc.id)}
                        />
                      </label>

                      {doc.fileUrl && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: '12px', color: 'var(--primary)' }}
                          onClick={() => setPreviewDoc(doc)}
                        >
                          👁️ معاينة
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: '12px', color: '#dc2626', padding: '4px 8px' }}
                        title="حذف المستند"
                        onClick={() => handleDeleteDocument(doc.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions - Sticky Frosted Glass Footer */}
          <div className="modal-actions-pro">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              style={{ padding: '8px 18px', fontSize: '13px', borderRadius: '8px' }}
            >
              إلغاء وتراجع
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>
                {activeTab === 'personal'
                  ? 'التبويب: البيانات الشخصية (1 من 4)'
                  : activeTab === 'job'
                  ? 'التبويب: بيانات الوظيفة (2 من 4)'
                  : activeTab === 'financial'
                  ? 'التبويب: المالية وساعات العمل (3 من 4)'
                  : 'التبويب: المستندات والوثائق (4 من 4)'}
              </span>
              <button
                type="submit"
                className="btn btn-start"
                disabled={isSaving}
                style={{
                  minWidth: '175px',
                  padding: '9px 24px',
                  fontWeight: 800,
                  borderRadius: '8px',
                  fontSize: '13.5px',
                  opacity: isSaving ? 0.75 : 1,
                  cursor: isSaving ? 'not-allowed' : 'pointer'
                }}
              >
                {isSaving ? '⏳ جاري الحفظ والتأمين...' : '💾 حفظ ملف الموظف'}
              </button>
            </div>
          </div>
        </form>

        {/* Inner Document Preview Modal */}
        {previewDoc && (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="doc-preview-modal-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, fontFamily: 'Cairo' }}>👁️ معاينة: {previewDoc.title}</h4>
                <button type="button" className="del-btn" onClick={() => setPreviewDoc(null)}>
                  ✖ إغلاق
                </button>
              </div>

              {previewDoc.fileType === 'pdf' ? (
                <iframe src={previewDoc.fileUrl} className="doc-preview-frame" title="PDF Preview" />
              ) : (
                <img src={previewDoc.fileUrl} alt={previewDoc.title} className="doc-preview-frame" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
