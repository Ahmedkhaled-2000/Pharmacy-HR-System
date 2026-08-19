import React, { useState, useEffect, useCallback } from 'react';
import './archive.css';

// Archive Components
import ArchiveNavbar from './ArchiveNavbar';
import ArchiveLoginPage from './ArchiveLoginPage';
import ArchiveInvoicesTab from './ArchiveInvoicesTab';
import ArchiveSuppliersTab from './ArchiveSuppliersTab';
import ArchiveEmployeesTab from './ArchiveEmployeesTab';
import ArchiveSettingsTab from './ArchiveSettingsTab';

// Modals
import UploadInvoiceModal from './UploadInvoiceModal';
import InvoiceDetailModal from './InvoiceDetailModal';
import SupplierDetailModal from './SupplierDetailModal';
import EmployeeManagerModal from './EmployeeManagerModal';
import FolderScanReviewModal from './FolderScanReviewModal';

// API Client
import {
  getArchiveToken,
  clearArchiveSession,
  apiArchiveGetSession,
  apiArchiveGetInvoices,
  apiArchiveGetSuppliers,
  apiArchiveGetEmployees,
  apiArchiveGetSettings
} from '../../utils/archiveApiClient';

export default function ArchiveSystemView({ isStandalone = false }) {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return Boolean(getArchiveToken());
  });
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Active Navigation Tab ('invoices' | 'suppliers' | 'employees' | 'settings')
  const [activeTab, setActiveTab] = useState('invoices');

  // Core Data
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [settings, setSettings] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);

  // Check Auth Session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = getArchiveToken();
      if (!token) {
        setIsAuthenticated(false);
        setIsCheckingAuth(false);
        return;
      }

      try {
        const res = await apiArchiveGetSession();
        if (res.success && res.authenticated) {
          setIsAuthenticated(true);
        } else {
          clearArchiveSession();
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.warn('Archive session check offline fallback:', err);
        // If server is unreachable, trust local token if present
        setIsAuthenticated(Boolean(token));
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, []);

  // Fetch all archive data
  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [invRes, supRes, empRes, setRes] = await Promise.all([
        apiArchiveGetInvoices(),
        apiArchiveGetSuppliers(),
        apiArchiveGetEmployees(),
        apiArchiveGetSettings()
      ]);

      if (invRes.success && Array.isArray(invRes.invoices)) {
        setInvoices(invRes.invoices);
      }
      if (supRes.success && Array.isArray(supRes.suppliers)) {
        setSuppliers(supRes.suppliers);
      }
      if (empRes.success && Array.isArray(empRes.employees)) {
        setEmployees(empRes.employees);
      }
      if (setRes.success && setRes.settings) {
        setSettings(setRes.settings);
      }
    } catch (err) {
      console.error('Failed to load archive data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadAllData();
    }
  }, [isAuthenticated, loadAllData]);

  const handleLogout = () => {
    if (window.confirm('هل ترغب في تسجيل الخروج من نظام أرشيف الصيدلية؟')) {
      clearArchiveSession();
      setIsAuthenticated(false);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    loadAllData();
  };

  // Loading Screen
  if (isCheckingAuth) {
    return (
      <div className="arch-root" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div className="arch-animate-pulse" style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🗄️</div>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>جاري التحقق من جلسة الأرشيف...</div>
        </div>
      </div>
    );
  }

  // If not authenticated, render independent login screen
  if (!isAuthenticated) {
    return <ArchiveLoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="arch-root">
      
      {/* Top Navbar */}
      <ArchiveNavbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenUploadModal={() => setIsUploadOpen(true)}
        onOpenEmployeeModal={() => setIsEmployeeModalOpen(true)}
        onLogout={handleLogout}
        settings={settings}
      />

      {/* Main Content Area */}
      <main className="arch-content">
        
        {/* Tab 1: Invoices & Dashboard Archive */}
        {activeTab === 'invoices' && (
          <ArchiveInvoicesTab
            invoices={invoices}
            suppliers={suppliers}
            employees={employees}
            isLoading={isLoading}
            onOpenUploadModal={() => setIsUploadOpen(true)}
            onOpenScanModal={() => setIsScanModalOpen(true)}
            onSelectInvoice={(inv) => setSelectedInvoice(inv)}
            onInvoiceDeleted={loadAllData}
          />
        )}

        {/* Tab 2: Suppliers Directory & Mappings */}
        {activeTab === 'suppliers' && (
          <ArchiveSuppliersTab
            suppliers={suppliers}
            onSelectSupplier={(s) => setSelectedSupplier(s)}
            onSupplierSaved={loadAllData}
          />
        )}

        {/* Tab 3: Employees Management */}
        {activeTab === 'employees' && (
          <ArchiveEmployeesTab
            employees={employees}
            onOpenEmployeeModal={() => setIsEmployeeModalOpen(true)}
            onEmployeeSaved={loadAllData}
          />
        )}

        {/* Tab 4: System Settings */}
        {activeTab === 'settings' && (
          <ArchiveSettingsTab
            settings={settings}
            onSettingsSaved={loadAllData}
          />
        )}

      </main>

      {/* Modals & Overlays */}
      <UploadInvoiceModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        suppliers={suppliers}
        employees={employees}
        settings={settings}
        onInvoiceSaved={loadAllData}
      />

      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          suppliers={suppliers}
          employees={employees}
          onInvoiceUpdated={loadAllData}
        />
      )}

      {selectedSupplier && (
        <SupplierDetailModal
          supplier={selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
          onSupplierUpdated={loadAllData}
        />
      )}

      <EmployeeManagerModal
        isOpen={isEmployeeModalOpen}
        onClose={() => setIsEmployeeModalOpen(false)}
        employees={employees}
        onEmployeeSaved={loadAllData}
      />

      <FolderScanReviewModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        settings={settings}
        onConfirmBatch={loadAllData}
      />

    </div>
  );
}
