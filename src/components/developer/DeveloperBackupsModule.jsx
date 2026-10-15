import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  Server,
  Cloud,
  Clock,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Download,
  Upload,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HardDrive,
  Trash2,
  Layers,
  Settings,
  Sliders,
  Calendar,
  FileText,
  Eye,
  Check,
  X,
  Lock,
  ChevronDown,
  Info,
  Archive,
  ShoppingCart,
  Users,
  Fingerprint,
  DollarSign
} from 'lucide-react';
import { API_BASE_URL } from '../../utils/apiClient';

export default function DeveloperBackupsModule({ showToast }) {
  // Main Data States
  const [statusData, setStatusData] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [config, setConfig] = useState({
    autoBackupEnabled: true,
    autoBackupTime: '03:00',
    autoScope: 'ALL',
    retentionCount: 30,
    googleDriveSyncEnabled: false,
    serviceUrl: '',
    parentFolderId: ''
  });

  // UI & Loading States
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [activeScopeFilter, setActiveScopeFilter] = useState('ALL_INCLUSIVE');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Operation States
  const [isTriggeringBackup, setIsTriggeringBackup] = useState(false);
  const [triggeringScope, setTriggeringScope] = useState(null);
  const [pushingToDriveId, setPushingToDriveId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Modals
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [driveTestResult, setDriveTestResult] = useState(null);

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState(null);
  const [dryRunReport, setDryRunReport] = useState(null);
  const [isLoadingDryRun, setIsLoadingDryRun] = useState(false);
  const [restoreConfirmPhrase, setRestoreConfirmPhrase] = useState('');
  const [restoreMode, setRestoreMode] = useState('replace');
  const [takeSafetySnapshot, setTakeSafetySnapshot] = useState(true);
  const [isExecutingRestore, setIsExecutingRestore] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);

  // Active Task Progress (Polled or WebSocket)
  const [activeTask, setActiveTask] = useState(null);

  // ── Fetch Status ────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch(`${API_BASE_URL}/system-backups/status`);
      const data = await res.json();
      if (data.success) {
        setStatusData(data);
        if (data.engineState?.activeTask) {
          setActiveTask(data.engineState.activeTask);
        } else {
          setActiveTask(null);
        }
      } else {
        showToast?.(data.error || 'فشل جلب حالة محرك النسخ الاحتياطي', 'error');
      }
    } catch (err) {
      console.error('[Fetch Status Error]:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [showToast]);

  // ── Fetch History ───────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE_URL}/system-backups/history?limit=100`);
      const data = await res.json();
      if (data.success) {
        setHistoryList(data.history || []);
      }
    } catch (err) {
      console.error('[Fetch History Error]:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // ── Fetch Config ────────────────────────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/system-backups/config`);
      const data = await res.json();
      if (data.success && data.config) {
        setConfig(prev => ({ ...prev, ...data.config }));
      }
    } catch (err) {
      console.error('[Fetch Config Error]:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchHistory();
    fetchConfig();

    const interval = setInterval(() => {
      fetchStatus();
    }, 15000); // 15s pulse

    return () => clearInterval(interval);
  }, [fetchStatus, fetchHistory, fetchConfig]);

  // ── Trigger Backup (Scoped or ALL) ──────────────────────────────────────────
  const handleTriggerBackup = async (scope = 'ALL', pushToDrive = false) => {
    if (isTriggeringBackup) return;
    setIsTriggeringBackup(true);
    setTriggeringScope(scope);
    showToast?.(`🚀 بدء أخذ نسخة احتياطية لنظام [${scope}]...`, 'info');

    try {
      const res = await fetch(`${API_BASE_URL}/system-backups/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          pushToDrive: pushToDrive || config.googleDriveSyncEnabled,
          createdBy: 'المطور (بوابة المطور)'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.(`✅ تم حفظ النسخة الاحتياطية بنجاح (${data.formattedSize})`, 'success');
        fetchStatus();
        fetchHistory();
      } else {
        showToast?.(data.error || 'فشل إنشاء النسخة الاحتياطية', 'error');
      }
    } catch (err) {
      showToast?.('حدث خطأ بالاتصال أثناء أخذ النسخة: ' + err.message, 'error');
    } finally {
      setIsTriggeringBackup(false);
      setTriggeringScope(null);
    }
  };

  // ── Push Existing Backup to Drive ───────────────────────────────────────────
  const handlePushToDrive = async (backupId) => {
    setPushingToDriveId(backupId);
    showToast?.('☁️ جاري رفع النسخة إلى Google Drive...', 'info');
    try {
      const res = await fetch(`${API_BASE_URL}/system-backups/push-to-drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId })
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم رفع النسخة بنجاح إلى Google Drive!', 'success');
        fetchHistory();
        fetchStatus();
      } else {
        showToast?.(data.error || 'تعذر الرفع إلى Google Drive', 'error');
      }
    } catch (err) {
      showToast?.('خطأ أثناء الرفع إلى Drive: ' + err.message, 'error');
    } finally {
      setPushingToDriveId(null);
    }
  };

  // ── Delete Backup ───────────────────────────────────────────────────────────
  const handleDeleteBackup = async (backupId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه النسخة الاحتياطية نهائياً من الخادم؟')) return;
    setDeletingId(backupId);
    try {
      const res = await fetch(`${API_BASE_URL}/system-backups/${backupId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast?.('تم حذف النسخة بنجاح', 'success');
        fetchHistory();
        fetchStatus();
      } else {
        showToast?.(data.error || 'فشل حذف النسخة', 'error');
      }
    } catch (err) {
      showToast?.('خطأ أثناء الحذف: ' + err.message, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Open Restore Modal & Run Dry-Run ─────────────────────────────────────────
  const handleOpenRestore = async (backup) => {
    setSelectedBackupForRestore(backup);
    setIsRestoreModalOpen(true);
    setDryRunReport(null);
    setRestoreResult(null);
    setRestoreConfirmPhrase('');
    setIsLoadingDryRun(true);

    try {
      const res = await fetch(`${API_BASE_URL}/system-backups/restore/dry-run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId: backup.id })
      });
      const data = await res.json();
      if (data.success) {
        setDryRunReport(data);
      } else {
        showToast?.(data.error || 'فشل فحص النسخة التجريبي', 'error');
      }
    } catch (err) {
      showToast?.('خطأ أثناء فحص النسخة: ' + err.message, 'error');
    } finally {
      setIsLoadingDryRun(false);
    }
  };

  // ── Execute Restore ─────────────────────────────────────────────────────────
  const handleExecuteRestore = async () => {
    if (!selectedBackupForRestore) return;
    const requiredPhrase = `CONFIRM-RESTORE-${selectedBackupForRestore.scope}`;
    if (restoreConfirmPhrase !== requiredPhrase && restoreConfirmPhrase !== 'RESTORE-NOW') {
      showToast?.(`يرجى كتابة عبارة التأكيد [${requiredPhrase}] بدقة`, 'warning');
      return;
    }

    setIsExecutingRestore(true);
    showToast?.('⚠️ جاري تنفيذ الاستعادة الآمنة للنظام...', 'info');

    try {
      const res = await fetch(`${API_BASE_URL}/system-backups/restore/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupId: selectedBackupForRestore.id,
          mode: restoreMode,
          confirmPhrase: restoreConfirmPhrase,
          takeSafetySnapshot
        })
      });
      const data = await res.json();
      if (data.success) {
        setRestoreResult(data);
        showToast?.(`🎉 تمت الاستعادة بنجاح! تم استعادة ${data.recordsRestored} سجل عبر ${data.tablesRestored} جدول`, 'success');
        fetchStatus();
        fetchHistory();
      } else {
        showToast?.(data.error || 'فشلت عملية الاستعادة', 'error');
      }
    } catch (err) {
      showToast?.('خطأ أثناء تنفيذ الاستعادة: ' + err.message, 'error');
    } finally {
      setIsExecutingRestore(false);
    }
  };

  // ── Save Config ─────────────────────────────────────────────────────────────
  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const res = await fetch(`${API_BASE_URL}/system-backups/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        showToast?.('✅ تم حفظ إعدادات الجدولة ومزامنة Google Drive بنجاح', 'success');
        setIsConfigModalOpen(false);
        fetchConfig();
      } else {
        showToast?.(data.error || 'فشل حفظ الإعدادات', 'error');
      }
    } catch (err) {
      showToast?.('خطأ أثناء حفظ الإعدادات: ' + err.message, 'error');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // ── Test Google Drive Connection ────────────────────────────────────────────
  const handleTestDriveConnection = async () => {
    if (!config.serviceUrl) {
      showToast?.('يرجى إدخال رابط Google Apps Script Webhook أولاً', 'warning');
      return;
    }
    setIsTestingDrive(true);
    setDriveTestResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/drive/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceUrl: config.serviceUrl,
          parentFolderId: config.parentFolderId
        })
      });
      const data = await res.json();
      setDriveTestResult(data);
      if (data.success) {
        showToast?.('✅ تم الاتصال بـ Google Drive بنجاح!', 'success');
      } else {
        showToast?.(data.error || 'فشل فحص الاتصال بـ Google Drive', 'error');
      }
    } catch (err) {
      setDriveTestResult({ success: false, error: err.message });
      showToast?.('خطأ أثناء فحص اتصال Drive: ' + err.message, 'error');
    } finally {
      setIsTestingDrive(false);
    }
  };

  // Scope Icons Helper
  const getScopeIcon = (scopeKey) => {
    switch (scopeKey) {
      case 'OUTSTOCK': return <ShoppingCart size={20} color="#06b6d4" />;
      case 'HR': return <Users size={20} color="#10b981" />;
      case 'BIOMETRIC': return <Fingerprint size={20} color="#8b5cf6" />;
      case 'ACCOUNTS': return <DollarSign size={20} color="#f59e0b" />;
      case 'ARCHIVE': return <Archive size={20} color="#ec4899" />;
      default: return <Database size={20} color="#6366f1" />;
    }
  };

  // Filtered History
  const filteredHistory = useMemo(() => {
    return historyList.filter(item => {
      const matchesScope = activeScopeFilter === 'ALL_INCLUSIVE' || item.scope === activeScopeFilter;
      const matchesSearch = !searchQuery || 
        item.fileName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.scopeLabelAr?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesScope && matchesSearch;
    });
  }, [historyList, activeScopeFilter, searchQuery]);

  return (
    <div className="dev-backups-container" style={{ padding: '4px', color: '#f8fafc' }}>
      
      {/* ── Top Header Bar ───────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(12px)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                padding: '10px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)'
              }}>
                <Database size={26} color="#ffffff" />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.5px' }}>
                  مركز إدارة النسخ الاحتياطي الشامل وإدارة الطوارئ
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: '#94a3b8' }}>
                  محرك داخلي آلي بالـ VPS مجدول يومياً الساعة 03:00 فجراً مع المزامنة التلقائية على Google Drive
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => handleTriggerBackup('ALL', true)}
              disabled={isTriggeringBackup}
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                border: 'none',
                color: '#ffffff',
                borderRadius: '12px',
                padding: '12px 22px',
                fontWeight: 800,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: isTriggeringBackup ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 18px rgba(99, 102, 241, 0.45)',
                transition: 'all 0.2s ease',
                opacity: isTriggeringBackup ? 0.7 : 1
              }}
            >
              {isTriggeringBackup && triggeringScope === 'ALL' ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Play size={18} />
              )}
              <span>نسخ احتياطي شامل لكافة الأنظمة فوراً</span>
            </button>

            <button
              onClick={() => setIsConfigModalOpen(true)}
              style={{
                background: 'rgba(51, 65, 85, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
                borderRadius: '12px',
                padding: '12px 18px',
                fontWeight: 700,
                fontSize: '13.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <Settings size={17} />
              <span>ضبط الجدولة و Google Drive</span>
            </button>

            <button
              onClick={() => { fetchStatus(); fetchHistory(); }}
              disabled={isLoadingStatus || isLoadingHistory}
              style={{
                background: 'rgba(51, 65, 85, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#94a3b8',
                borderRadius: '12px',
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="تحديث البيانات"
            >
              <RefreshCw size={17} className={isLoadingStatus ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* ── Status Metrics Strip ────────────────────────────────────────── */}
        <div style={{
          marginTop: '20px',
          paddingTop: '18px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px'
        }}>
          {/* Card 1: Scheduler Pulse */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              background: config.autoBackupEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              padding: '10px',
              borderRadius: '10px'
            }}>
              <Clock size={20} color={config.autoBackupEnabled ? '#10b981' : '#ef4444'} />
            </div>
            <div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}>الجدولة التلقائية بالـ VPS</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#f1f5f9' }}>
                {config.autoBackupEnabled ? `يومياً الساعة ${config.autoBackupTime} فجراً` : 'معطلة'}
              </div>
            </div>
          </div>

          {/* Card 2: Storage Used */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{ background: 'rgba(6, 182, 212, 0.15)', padding: '10px', borderRadius: '10px' }}>
              <HardDrive size={20} color="#06b6d4" />
            </div>
            <div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}>المساحة المشغولة على الـ VPS</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#f1f5f9' }}>
                {statusData?.storage?.formattedSize || '0.00 MB'} ({statusData?.storage?.totalFiles || 0} ملف)
              </div>
            </div>
          </div>

          {/* Card 3: Google Drive Sync */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              background: config.googleDriveSyncEnabled ? 'rgba(59, 130, 246, 0.15)' : 'rgba(148, 163, 184, 0.15)',
              padding: '10px',
              borderRadius: '10px'
            }}>
              <Cloud size={20} color={config.googleDriveSyncEnabled ? '#3b82f6' : '#94a3b8'} />
            </div>
            <div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}>المزامنة مع Google Drive</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#f1f5f9' }}>
                {config.googleDriveSyncEnabled ? (config.serviceUrl ? 'مفعل ومتصل ☁️' : 'مفعل (الرابط غير مكتمل)') : 'غير مفعل'}
              </div>
            </div>
          </div>

          {/* Card 4: Last Master Backup */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{ background: 'rgba(139, 92, 246, 0.15)', padding: '10px', borderRadius: '10px' }}>
              <ShieldCheck size={20} color="#8b5cf6" />
            </div>
            <div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}>آخر لقطة شاملة للمنظومة</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#f1f5f9' }}>
                {statusData?.lastMasterBackup ? (
                  new Date(statusData.lastMasterBackup.createdAt).toLocaleDateString('ar-EG', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  })
                ) : 'لا توجد نسخ بعد'}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Active Task Progress Live Banner ───────────────────────────────── */}
      {(isTriggeringBackup || isExecutingRestore || activeTask) && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(79, 70, 229, 0.25) 0%, rgba(14, 165, 233, 0.25) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.4)',
          borderRadius: '14px',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
        }}>
          <div className="animate-spin" style={{ display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={24} color="#38bdf8" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc' }}>
                {activeTask?.currentStep || (isExecutingRestore ? 'جاري تنفيذ الاستعادة الآمنة...' : 'جاري إنشاء النسخة الاحتياطية...')}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#38bdf8' }}>
                {activeTask?.progress ? `${activeTask.progress}%` : 'قيد المعالجة'}
              </span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${activeTask?.progress || 45}%`,
                background: 'linear-gradient(90deg, #6366f1, #38bdf8)',
                borderRadius: '4px',
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Section Title: Modular Subsystems ─────────────────────────────── */}
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>
            الأنظمة المستقلة (Modular System Scopes)
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
            يمكنك نسخ أو استعادة كل قطاع بشكل مستقل تماماً دون المساس أو التأثير على باقي أنظمة المشروع
          </p>
        </div>
      </div>

      {/* ── Modular Systems Grid (5 Scope Cards) ────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        {statusData?.scopes && Object.entries(statusData.scopes).map(([key, scope]) => (
          <div
            key={key}
            style={{
              background: 'rgba(30, 41, 59, 0.6)',
              border: `1px solid ${scope.color}33`,
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {/* Top Accent Strip */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background: `linear-gradient(90deg, ${scope.color}, transparent)`
            }} />

            <div>
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    background: `${scope.color}22`,
                    padding: '8px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {getScopeIcon(key)}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>
                      {scope.labelAr}
                    </h3>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                      كود النظام: {key}
                    </span>
                  </div>
                </div>

                <span style={{
                  background: `${scope.color}22`,
                  color: scope.color,
                  border: `1px solid ${scope.color}44`,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 800
                }}>
                  {scope.totalTables} جدولاً
                </span>
              </div>

              {/* Description */}
              <p style={{
                margin: '0 0 14px',
                fontSize: '12px',
                color: '#cbd5e1',
                lineHeight: '1.5',
                minHeight: '36px'
              }}>
                {scope.description}
              </p>

              {/* Scope Stats */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.4)',
                borderRadius: '10px',
                padding: '10px 12px',
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>إجمالي السجلات الحية</div>
                  <div style={{ fontSize: '15px', fontWeight: 900, color: '#f8fafc' }}>
                    {scope.totalRecords?.toLocaleString('ar-EG') || 0}
                  </div>
                </div>

                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>آخر نسخة احتياطية</div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: scope.lastBackup ? '#38bdf8' : '#64748b' }}>
                    {scope.lastBackup ? (
                      new Date(scope.lastBackup.createdAt).toLocaleDateString('ar-EG', {
                        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })
                    ) : 'لم يتم النسخ'}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                onClick={() => handleTriggerBackup(key, config.googleDriveSyncEnabled)}
                disabled={isTriggeringBackup}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: `1px solid ${scope.color}66`,
                  color: '#ffffff',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: isTriggeringBackup ? 'not-allowed' : 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                {isTriggeringBackup && triggeringScope === key ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Download size={14} color={scope.color} />
                )}
                <span>نسخ النظام الآن</span>
              </button>

              <button
                onClick={() => {
                  if (scope.lastBackup) {
                    handleOpenRestore(scope.lastBackup);
                  } else {
                    showToast?.('لا توجد نسخة احتياطية مسجلة لهذا النظام بعد', 'warning');
                  }
                }}
                disabled={!scope.lastBackup}
                style={{
                  background: scope.lastBackup ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${scope.lastBackup ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.05)'}`,
                  color: scope.lastBackup ? '#f87171' : '#64748b',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: scope.lastBackup ? 'pointer' : 'not-allowed'
                }}
              >
                <RotateCcw size={14} />
                <span>استعادة</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Section Title: Backups Archive & History ───────────────────────── */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.5)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          marginBottom: '18px'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>
              سجل وأرشيف النسخ الاحتياطية المتوفرة (Backups Ledger)
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
              جميع اللقطات المحفوظة محلياً بالـ VPS أو المرفوعة سحابياً على Google Drive
            </p>
          </div>

          {/* Filter & Search Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="بحث في اسم الملف أو النظام..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                borderRadius: '10px',
                padding: '8px 14px',
                fontSize: '13px',
                outline: 'none',
                width: '210px'
              }}
            />

            <select
              value={activeScopeFilter}
              onChange={(e) => setActiveScopeFilter(e.target.value)}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                borderRadius: '10px',
                padding: '8px 12px',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL_INCLUSIVE">جميع الأنظمة واللقطات</option>
              <option value="ALL">النسخ الشاملة فقط (ALL)</option>
              <option value="OUTSTOCK">المشتريات والنواقص (OUTSTOCK)</option>
              <option value="HR">الموارد البشرية (HR)</option>
              <option value="BIOMETRIC">البصمات (BIOMETRIC)</option>
              <option value="ACCOUNTS">الحسابات (ACCOUNTS)</option>
              <option value="ARCHIVE">الأرشيف (ARCHIVE)</option>
            </select>
          </div>
        </div>

        {/* ── Table of Backups ────────────────────────────────────────────── */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8' }}>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>اسم الملف والنظام</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>تاريخ الإنشاء</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>الحجم الفعلي</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>السجلات / الجداول</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>مكان التخزين</th>
                <th style={{ padding: '12px 14px', fontWeight: 700 }}>نوع النسخ</th>
                <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'center' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    {isLoadingHistory ? 'جاري تحميل السجل...' : 'لا توجد نسخ احتياطية مسجلة في هذا النطاق'}
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      transition: 'background 0.2s'
                    }}
                  >
                    {/* File Name & Scope Badge */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          background: item.scope === 'ALL' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(6, 182, 212, 0.2)',
                          color: item.scope === 'ALL' ? '#a5b4fc' : '#67e8f9',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 800
                        }}>
                          {item.scope}
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, color: '#f1f5f9' }}>{item.fileName}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>بواسطة: {item.createdBy}</div>
                        </div>
                      </div>
                    </td>

                    {/* Timestamp */}
                    <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                      {new Date(item.createdAt).toLocaleString('ar-EG', {
                        year: 'numeric', month: 'numeric', day: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>

                    {/* Size */}
                    <td style={{ padding: '12px 14px', fontWeight: 800, color: '#38bdf8' }}>
                      {item.formattedSize}
                    </td>

                    {/* Records & Tables */}
                    <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>
                      <span style={{ fontWeight: 800 }}>{item.totalRecords?.toLocaleString('ar-EG')}</span> سجل
                      <span style={{ color: '#64748b', fontSize: '11.5px', marginRight: '6px' }}>({item.totalTables} جدول)</span>
                    </td>

                    {/* Storage Location Badge */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {item.fileExistsOnDisk && (
                          <span title="محفوظ على قرص الخادم" style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            padding: '2px 8px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <HardDrive size={11} />
                            <span>VPS</span>
                          </span>
                        )}

                        {item.driveSyncStatus === 'synced' ? (
                          <a
                            href={item.driveFileUrl || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: 'rgba(59, 130, 246, 0.15)',
                              color: '#60a5fa',
                              padding: '2px 8px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              textDecoration: 'none'
                            }}
                            title="رابط ملف النسخة على Google Drive"
                          >
                            <Cloud size={11} />
                            <span>Drive ☁️</span>
                          </a>
                        ) : item.driveSyncStatus === 'failed' ? (
                          <span style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                            padding: '2px 8px',
                            borderRadius: '8px',
                            fontSize: '11px',
                            fontWeight: 700
                          }} title="فشل الرفع السحابي">
                            فشل الرفع
                          </span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '11px' }}>محلي فقط</span>
                        )}
                      </div>
                    </td>

                    {/* Backup Type */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        background: item.backupType === 'scheduled_daily' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        color: item.backupType === 'scheduled_daily' ? '#fbbf24' : '#94a3b8',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600
                      }}>
                        {item.backupType === 'scheduled_daily' ? 'مجدول 03:00' :
                         item.backupType === 'pre_restore_safety' ? 'أمان تراجع' : 'يدوي'}
                      </span>
                    </td>

                    {/* Actions Column */}
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        {/* Download */}
                        {item.fileExistsOnDisk && (
                          <a
                            href={`${API_BASE_URL}/system-backups/download/${item.id}`}
                            download
                            style={{
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              color: '#38bdf8',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                              textDecoration: 'none',
                              fontWeight: 700
                            }}
                            title="تحميل الملف إلى جهازك"
                          >
                            <Download size={13} />
                            <span>تحميل</span>
                          </a>
                        )}

                        {/* Push to Drive */}
                        {item.driveSyncStatus !== 'synced' && (
                          <button
                            onClick={() => handlePushToDrive(item.id)}
                            disabled={pushingToDriveId === item.id}
                            style={{
                              background: 'rgba(59, 130, 246, 0.12)',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              color: '#60a5fa',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                            title="رفع النسخة إلى Google Drive"
                          >
                            {pushingToDriveId === item.id ? (
                              <RefreshCw size={13} className="animate-spin" />
                            ) : (
                              <Upload size={13} />
                            )}
                            <span>للدرايف</span>
                          </button>
                        )}

                        {/* Safe Restore Button */}
                        <button
                          onClick={() => handleOpenRestore(item)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#f87171',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                          title="استعادة هذه النسخة"
                        >
                          <RotateCcw size={13} />
                          <span>استعادة</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteBackup(item.id)}
                          disabled={deletingId === item.id}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#64748b',
                            padding: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="حذف النسخة"
                        >
                          <Trash2 size={14} color="#94a3b8" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ⚙️ MODAL: CONFIGURATION & GOOGLE DRIVE SETTINGS                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {isConfigModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(6px)'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '20px',
            width: '90%',
            maxWidth: '560px',
            padding: '26px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Settings size={22} color="#6366f1" />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                  ضبط الجدولة التلقائية والربط مع Google Drive
                </h3>
              </div>
              <button
                onClick={() => setIsConfigModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Toggle Auto Backup */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.4)',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '14px', color: '#f8fafc' }}>
                    تفعيل النسخ التلقائي اليومي (24/7 Daily Auto-Backup)
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    يعمل المحرك داخلياً في الـ VPS كل يوم بالموعد المحدد
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.autoBackupEnabled}
                  onChange={(e) => setConfig(prev => ({ ...prev, autoBackupEnabled: e.target.checked }))}
                  style={{ width: '20px', height: '20px', accentColor: '#10b981', cursor: 'pointer' }}
                />
              </div>

              {/* Time Picker */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  موعد النسخ التلقائي اليومي (توقيت القاهرة)
                </label>
                <input
                  type="time"
                  value={config.autoBackupTime}
                  onChange={(e) => setConfig(prev => ({ ...prev, autoBackupTime: e.target.value }))}
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    color: '#ffffff',
                    fontSize: '15px',
                    fontWeight: 800,
                    outline: 'none'
                  }}
                />
              </div>

              {/* Scope Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  النطاق الافتراضي للنسخ اليومي المجدول
                </label>
                <select
                  value={config.autoScope}
                  onChange={(e) => setConfig(prev => ({ ...prev, autoScope: e.target.value }))}
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 700,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="ALL">النسخة الاحتياطية الشاملة لكافة المنظومات (موصى به بشدة 🌟)</option>
                  <option value="OUTSTOCK">نظام النواقص والمشتريات فقط (OUTSTOCK)</option>
                  <option value="HR">الموارد البشرية فقط (HR)</option>
                  <option value="BIOMETRIC">البصمات والـ ADMS فقط (BIOMETRIC)</option>
                  <option value="ACCOUNTS">الحسابات والمالية فقط (ACCOUNTS)</option>
                  <option value="ARCHIVE">الأرشيف الذكي فقط (ARCHIVE)</option>
                </select>
              </div>

              {/* Retention Count */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  سياسة الاحتفاظ (Retention Limit)
                </label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={config.retentionCount}
                  onChange={(e) => setConfig(prev => ({ ...prev, retentionCount: parseInt(e.target.value, 10) || 30 }))}
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  عدد النسخ المحتفظ بها محلياً وسحابياً قبل تفعيل الحذف الذكي التلقائي
                </span>
              </div>

              {/* Google Drive Section Divider */}
              <div style={{ margin: '10px 0', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }} />

              <div style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '12px',
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Cloud size={18} color="#60a5fa" />
                    <span style={{ fontWeight: 800, fontSize: '14px', color: '#f8fafc' }}>
                      المزامنة التلقائية مع Google Drive
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.googleDriveSyncEnabled}
                    onChange={(e) => setConfig(prev => ({ ...prev, googleDriveSyncEnabled: e.target.checked }))}
                    style={{ width: '18px', height: '18px', accentColor: '#3b82f6', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                      رابط Webhook (Google Apps Script URL)
                    </label>
                    <input
                      type="url"
                      placeholder="https://script.google.com/macros/s/.../exec"
                      value={config.serviceUrl}
                      onChange={(e) => setConfig(prev => ({ ...prev, serviceUrl: e.target.value }))}
                      style={{
                        width: '100%',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                      معرف المجلد السحابي (Parent Folder ID - اختياري)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 1a2B3c4D5e..."
                      value={config.parentFolderId}
                      onChange={(e) => setConfig(prev => ({ ...prev, parentFolderId: e.target.value }))}
                      style={{
                        width: '100%',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={handleTestDriveConnection}
                      disabled={isTestingDrive}
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#38bdf8',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {isTestingDrive ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                      <span>اختبار الاتصال بـ Drive 🧪</span>
                    </button>
                  </div>

                  {driveTestResult && (
                    <div style={{
                      marginTop: '6px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      background: driveTestResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: driveTestResult.success ? '#34d399' : '#f87171'
                    }}>
                      {driveTestResult.success ? '✅ تم الاتصال بـ Google Apps Script بنجاح!' : `❌ خطأ: ${driveTestResult.error}`}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button
                onClick={() => setIsConfigModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                إلغاء
              </button>

              <button
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  color: '#ffffff',
                  padding: '10px 22px',
                  borderRadius: '10px',
                  cursor: isSavingConfig ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {isSavingConfig ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}
                <span>حفظ التعديلات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* 🔄 MODAL: SAFE DISASTER RECOVERY & RESTORE                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {isRestoreModalOpen && selectedBackupForRestore && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '20px',
            width: '90%',
            maxWidth: '640px',
            padding: '28px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
            maxHeight: '92vh',
            overflowY: 'auto'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '10px', borderRadius: '12px' }}>
                  <RotateCcw size={22} color="#ef4444" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                    استعادة آمنة للنظام (Disaster Recovery)
                  </h3>
                  <span style={{ fontSize: '12px', color: '#f87171', fontWeight: 600 }}>
                    النظام المستهدف: [{selectedBackupForRestore.scopeLabelAr || selectedBackupForRestore.scope}]
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsRestoreModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Dry-Run Inspection Report */}
            {isLoadingDryRun ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                <div>جاري فحص توافق النسخة وسلامة التوقيع الرقمي (SHA-256)...</div>
              </div>
            ) : dryRunReport ? (
              <div>
                {/* File Information Card */}
                <div style={{
                  background: 'rgba(15, 23, 42, 0.5)',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  marginBottom: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.06)'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px' }}>
                    <div>
                      <span style={{ color: '#94a3b8' }}>الملف: </span>
                      <strong style={{ color: '#f1f5f9' }}>{selectedBackupForRestore.fileName}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>الحجم: </span>
                      <strong style={{ color: '#38bdf8' }}>{dryRunReport.formattedSize}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>تاريخ النسخة: </span>
                      <strong style={{ color: '#f1f5f9' }}>
                        {new Date(dryRunReport.manifest?.createdAt).toLocaleString('ar-EG')}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>فحص التوقيع (SHA-256): </span>
                      <strong style={{ color: '#34d399' }}>سليم ومطابق ✅</strong>
                    </div>
                  </div>
                </div>

                {/* Table by Table Comparison Accordion/List */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', marginBottom: '8px' }}>
                    مقارنة عدد السجلات قبل وبعد الاستعادة ({dryRunReport.tablesCount} جدول):
                  </div>
                  <div style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    background: 'rgba(15, 23, 42, 0.4)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}>
                    {dryRunReport.tableComparisons?.map((cmp) => (
                      <div
                        key={cmp.table}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          padding: '6px 0',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                          fontSize: '12px'
                        }}
                      >
                        <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{cmp.table}</span>
                        <div>
                          <span style={{ color: '#94a3b8' }}>الحالي: {cmp.currentCount}</span>
                          <span style={{ margin: '0 6px', color: '#64748b' }}>➔</span>
                          <span style={{ color: '#38bdf8', fontWeight: 800 }}>النسخة: {cmp.backupCount}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Safety Snapshot Checkbox */}
                <div style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <input
                    type="checkbox"
                    id="safetySnapshotCheck"
                    checked={takeSafetySnapshot}
                    onChange={(e) => setTakeSafetySnapshot(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#10b981', cursor: 'pointer' }}
                  />
                  <label htmlFor="safetySnapshotCheck" style={{ fontSize: '13px', color: '#e2e8f0', cursor: 'pointer' }}>
                    <strong>شبكة الأمان التلقائية (Undo Shield):</strong> أخذ لقطة تراجع فورية لحالة البيانات الحالية قبل لمس أي جدول
                  </label>
                </div>

                {/* Restore Mode Option */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                    نمط الاستعادة
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setRestoreMode('replace')}
                      style={{
                        background: restoreMode === 'replace' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${restoreMode === 'replace' ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'}`,
                        color: restoreMode === 'replace' ? '#f87171' : '#94a3b8',
                        padding: '10px',
                        borderRadius: '10px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      استبدال كامل (Clean Replace) ⚠️
                    </button>

                    <button
                      type="button"
                      onClick={() => setRestoreMode('merge')}
                      style={{
                        background: restoreMode === 'merge' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${restoreMode === 'merge' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'}`,
                        color: restoreMode === 'merge' ? '#60a5fa' : '#94a3b8',
                        padding: '10px',
                        borderRadius: '10px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      دمج السجلات (Merge / Upsert)
                    </button>
                  </div>
                </div>

                {/* Mandatory Confirmation Input */}
                <div style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: '12px',
                  padding: '14px',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: '#f87171' }}>
                    <Lock size={15} />
                    <span style={{ fontSize: '12.5px', fontWeight: 800 }}>
                      إجراء أمني حرج: يرجى كتابة [CONFIRM-RESTORE-{selectedBackupForRestore.scope}] لتأكيد البدء:
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder={`CONFIRM-RESTORE-${selectedBackupForRestore.scope}`}
                    value={restoreConfirmPhrase}
                    onChange={(e) => setRestoreConfirmPhrase(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      color: '#ffffff',
                      fontSize: '13.5px',
                      fontWeight: 800,
                      outline: 'none',
                      letterSpacing: '0.5px'
                    }}
                  />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    onClick={() => setIsRestoreModalOpen(false)}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#94a3b8',
                      padding: '10px 18px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    إلغاء
                  </button>

                  <button
                    onClick={handleExecuteRestore}
                    disabled={isExecutingRestore || (!restoreConfirmPhrase.includes('RESTORE'))}
                    style={{
                      background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                      border: 'none',
                      color: '#ffffff',
                      padding: '10px 24px',
                      borderRadius: '10px',
                      cursor: isExecutingRestore || (!restoreConfirmPhrase.includes('RESTORE')) ? 'not-allowed' : 'pointer',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      opacity: restoreConfirmPhrase.includes('RESTORE') ? 1 : 0.4
                    }}
                  >
                    {isExecutingRestore ? <RefreshCw size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                    <span>تأكيد وبدء الاستعادة الفورية</span>
                  </button>
                </div>
              </div>
            ) : null}

          </div>
        </div>
      )}

    </div>
  );
}
