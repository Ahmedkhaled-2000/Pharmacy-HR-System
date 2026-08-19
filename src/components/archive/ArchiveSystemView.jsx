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
  const [employeeToEdit, setEmployeeToEdit] = useState(null);
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
      <div className="arch-root min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center text-slate-400">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-2xl mx-auto mb-3 animate-pulse border border-blue-500/20">
            🗄️
          </div>
          <div className="font-bold text-sm text-slate-300">جاري التحقق من جلسة الأرشيف...</div>
        </div>
      </div>
    );
  }

  // If not authenticated, render independent login screen
  if (!isAuthenticated) {
    return <ArchiveLoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="arch-root min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* Top Navbar */}
      <ArchiveNavbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenUploadModal={() => setIsUploadOpen(true)}
        onOpenEmployeeModal={() => {
          setEmployeeToEdit(null);
          setIsEmployeeModalOpen(true);
        }}
        onLogout={handleLogout}
        settings={settings}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        
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
            onSelectSupplier={(s) => setSelectedSupplier(s)}
            onInvoiceDeleted={loadAllData}
          />
        )}

        {/* Tab 2: Suppliers Directory & Mappings */}
        {activeTab === 'suppliers' && (
          <ArchiveSuppliersTab
            suppliers={suppliers}
            isLoading={isLoading}
            onSelectSupplier={(s) => setSelectedSupplier(s)}
            onSupplierSaved={loadAllData}
            onSupplierDeleted={loadAllData}
          />
        )}

        {/* Tab 3: Employees Management */}
        {activeTab === 'employees' && (
          <ArchiveEmployeesTab
            employees={employees}
            invoices={invoices}
            isLoading={isLoading}
            onOpenEmployeeModal={(emp) => {
              setEmployeeToEdit(emp);
              setIsEmployeeModalOpen(true);
            }}
            onSelectInvoice={(inv) => setSelectedInvoice(inv)}
            onEmployeeSaved={loadAllData}
            onEmployeeDeleted={loadAllData}
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
          invoices={invoices}
          onClose={() => setSelectedSupplier(null)}
          onSelectInvoice={(inv) => setSelectedInvoice(inv)}
          onSupplierUpdated={loadAllData}
          onSupplierDeleted={loadAllData}
        />
      )}

      <EmployeeManagerModal
        isOpen={isEmployeeModalOpen}
        onClose={() => {
          setIsEmployeeModalOpen(false);
          setEmployeeToEdit(null);
        }}
        employeeToEdit={employeeToEdit}
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
