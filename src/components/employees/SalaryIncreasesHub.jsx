import React, { useState, useMemo, useEffect } from 'react';
import { fmt, getEmpDisplayName, getEmpWhatsAppPhone } from '../../utils/formatters';
import { triggerDirectPrint } from '../../utils/printHelper';
import { getResolvedWhatsAppServerUrl } from '../../utils/systemUrlHelper';
import {
  generateSalaryIncreaseCertificateHtml,
  populateWhatsAppTemplate,
  READY_WHATSAPP_TEMPLATES
} from '../../utils/whatsappTemplates';
import SalaryIncreaseCertificateModal from './SalaryIncreaseCertificateModal';

export default function SalaryIncreasesHub({
  isOpen,
  onClose,
  state,
  showToast = (msg) => alert(msg)
}) {
  if (!isOpen) return null;

  const employees = state?.employees || [];
  const branches = state?.branches || [];
  const orgSettings = state?.orgSettings || {};

  // State filters
  const [filterMode, setFilterMode] = useState('with_increases'); // 'with_increases' | 'all'
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmpIds, setSelectedEmpIds] = useState([]);

  // Modal for Single Certificate Preview / Edit
  const [certModalEmp, setCertModalEmp] = useState(null);
  const [certModalRecord, setCertModalRecord] = useState(null);

  // Bulk WhatsApp Dispatch State
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [bulkIncludePdf, setBulkIncludePdf] = useState(true);
  const [bulkTemplateId, setBulkTemplateId] = useState('promotion_official_certificate');
  const [bulkReport, setBulkReport] = useState(null);

  // Single Quick Send State
  const [quickSendingId, setQuickSendingId] = useState(null);

  // Server health state
  const [serverHealth, setServerHealth] = useState({ status: 'checking', phone: '', message: 'جاري فحص اتصال خادم الواتساب...' });
  const waServerUrl = useMemo(() => getResolvedWhatsAppServerUrl(state), [state]);

  useEffect(() => {
    let isMounted = true;
    fetch(`${waServerUrl}/api/status`, { headers: { 'bypass-tunnel-reminder': 'true' } })
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.status === 'CONNECTED') {
          setServerHealth({
            status: 'connected',
            phone: data.phone || '',
            message: `خادم الواتساب متصل ${data.phone ? '(+' + data.phone + ')' : ''}`
          });
        } else if (data.status === 'QR_READY') {
          setServerHealth({
            status: 'qr_ready',
            phone: '',
            message: 'خادم الواتساب بانتظار مسح رمز QR'
          });
        } else {
          setServerHealth({
            status: 'disconnected',
            phone: '',
            message: 'خادم الواتساب غير متصل حالياً'
          });
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setServerHealth({
          status: 'error',
          phone: '',
          message: 'تعذر الاتصال بخادم الواتساب'
        });
      });
    return () => { isMounted = false; };
  }, [waServerUrl]);

  // Derive employees list with resolved branch & raises details
  const enrichedEmployees = useMemo(() => {
    return employees.map((emp) => {
      const increases = Array.isArray(emp.salaryIncreases) ? emp.salaryIncreases : [];
      const lastInc = increases[0] || emp.lastIncrease || (increases.length > 0 ? increases[increases.length - 1] : null);
      
      let branchName = emp.branchName || '';
      if (!branchName && emp.branchesDetails && emp.branchesDetails[0]?.branchId) {
        const b = branches.find((item) => item.id === emp.branchesDetails[0].branchId);
        if (b) branchName = b.name;
      }
      if (!branchName && emp.branchId) {
        const b = branches.find((item) => item.id === emp.branchId);
        if (b) branchName = b.name;
      }
      if (!branchName) branchName = 'الفرع الرئيسي';

      const currentRate = (emp.branchesDetails && emp.branchesDetails[0]?.salary !== undefined && emp.branchesDetails[0]?.salary !== '')
        ? parseFloat(emp.branchesDetails[0].salary) || 0
        : (parseFloat(emp.salary) || 0);

      const rateBefore = lastInc?.rateBefore !== undefined ? parseFloat(lastInc.rateBefore) : currentRate;
      const rateAfter = lastInc?.rateAfter !== undefined ? parseFloat(lastInc.rateAfter) : currentRate;
      const diff = rateAfter - rateBefore;
      const pct = rateBefore > 0 ? ((diff / rateBefore) * 100).toFixed(1) : '0.0';

      return {
        ...emp,
        resolvedBranchName: branchName,
        salaryIncreases: increases,
        latestIncrease: lastInc,
        currentRate,
        rateBefore,
        rateAfter,
        diff,
        pct
      };
    });
  }, [employees, branches]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return enrichedEmployees.filter((emp) => {
      // Filter by increases existence
      if (filterMode === 'with_increases' && (!emp.salaryIncreases || emp.salaryIncreases.length === 0)) {
        return false;
      }
      // Filter by branch
      if (selectedBranchId !== 'all') {
        const empBranchId = emp.branchesDetails?.[0]?.branchId || emp.branchId;
        if (empBranchId !== selectedBranchId) return false;
      }
      // Filter by search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const name = (emp.name || emp.displayName || '').toLowerCase();
        const code = String(emp.code || '').toLowerCase();
        const job = String(emp.jobTitle || '').toLowerCase();
        const branch = String(emp.resolvedBranchName || '').toLowerCase();
        return name.includes(term) || code.includes(term) || job.includes(term) || branch.includes(term);
      }
      return true;
    });
  }, [enrichedEmployees, filterMode, selectedBranchId, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const totalWithIncreases = enrichedEmployees.filter((e) => e.salaryIncreases && e.salaryIncreases.length > 0).length;
    let totalIncreasesCount = 0;
    enrichedEmployees.forEach((e) => {
      totalIncreasesCount += (e.salaryIncreases ? e.salaryIncreases.length : 0);
    });
    return {
      totalEmployees: enrichedEmployees.length,
      totalWithIncreases,
      totalIncreasesCount
    };
  }, [enrichedEmployees]);

  // Checkbox Selection
  const handleSelectAll = () => {
    if (selectedEmpIds.length === filteredEmployees.length) {
      setSelectedEmpIds([]);
    } else {
      setSelectedEmpIds(filteredEmployees.map((e) => e.id));
    }
  };

  const handleToggleSelect = (empId) => {
    setSelectedEmpIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  // Open single certificate preview
  const handleOpenCert = (emp) => {
    setCertModalEmp(emp);
    setCertModalRecord(emp.latestIncrease || null);
  };

  // Quick single WhatsApp send
  const handleQuickSend = async (emp) => {
    const phone = getEmpWhatsAppPhone(emp) || emp.phone;
    if (!phone) {
      showToast('⚠️ لا يوجد رقم هاتف مسجل لهذا الموظف');
      return;
    }

    setQuickSendingId(emp.id);
    try {
      const promoData = {
        type: emp.latestIncrease?.type || 'annual',
        typeLabel: emp.latestIncrease?.type === 'exceptional' ? 'زيادة استثنائية لكفاءة وتميز' : 'زيادة سنوية دورية',
        effectiveDate: emp.latestIncrease?.effectiveDate || new Date().toISOString().slice(0, 10),
        rateBefore: emp.rateBefore,
        rateAfter: emp.rateAfter,
        percentage: emp.pct,
        decisionNumber: emp.latestIncrease?.decisionNumber || `INC-${emp.code || 'EMP'}`,
        includePdf: true
      };

      const templateObj = READY_WHATSAPP_TEMPLATES.find((t) => t.id === 'promotion_official_certificate');
      const messageText = populateWhatsAppTemplate(
        templateObj?.text || '',
        emp,
        {},
        orgSettings,
        '',
        emp.resolvedBranchName,
        promoData
      );

      const certHtml = generateSalaryIncreaseCertificateHtml(
        emp,
        {
          decisionNumber: promoData.decisionNumber,
          type: promoData.type,
          decisionDate: emp.latestIncrease?.decisionDate || promoData.effectiveDate,
          effectiveDate: promoData.effectiveDate,
          rateBefore: emp.rateBefore,
          rateAfter: emp.rateAfter,
          jobTitle: emp.jobTitle,
          branchName: emp.resolvedBranchName,
          phone: phone,
          appreciationText: emp.latestIncrease?.notes
        },
        orgSettings,
        emp.resolvedBranchName
      );

      const res = await fetch(`${waServerUrl}/api/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
        body: JSON.stringify({
          phone: phone,
          message: messageText,
          includePdf: true,
          pdfHtml: certHtml,
          fileName: `شهادة_زيادة_راتب_${(emp.displayName || emp.name || 'موظف').replace(/\s+/g, '_')}.pdf`
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`✅ تم إرسال شهادة الزيادة بنجاح للموظف: ${getEmpDisplayName(emp)}`);
      } else {
        showToast(`❌ تعذر الإرسال: ${data.message || 'خطأ غير معروف في خادم الواتساب'}`);
      }
    } catch (err) {
      showToast(`❌ فشل الاتصال بالسيرفر: ${err.message}`);
    } finally {
      setQuickSendingId(null);
    }
  };

  // Bulk WhatsApp Dispatch Execution
  const handleStartBulkSend = async () => {
    const targetEmployees = filteredEmployees.filter((e) => selectedEmpIds.includes(e.id));
    if (targetEmployees.length === 0) {
      showToast('⚠️ يرجى تحديد موظف واحد على الأقل للإرسال الجماعي');
      return;
    }

    if (!window.confirm(`هل أنت متأكد من بدء الإرسال الجماعي لشهادات الزيادات لعدد (${targetEmployees.length}) موظف عبر الواتساب؟`)) {
      return;
    }

    setIsSendingBulk(true);
    setBulkReport(null);
    let successCount = 0;
    let failedCount = 0;
    const failures = [];

    setBulkProgress({ current: 0, total: targetEmployees.length, success: 0, failed: 0 });

    for (let i = 0; i < targetEmployees.length; i++) {
      const emp = targetEmployees[i];
      const phone = getEmpWhatsAppPhone(emp) || emp.phone;

      setBulkProgress({ current: i + 1, total: targetEmployees.length, success: successCount, failed: failedCount });

      if (!phone) {
        failedCount++;
        failures.push({ name: getEmpDisplayName(emp), reason: 'لا يوجد رقم هاتف' });
        continue;
      }

      try {
        const promoData = {
          type: emp.latestIncrease?.type || 'annual',
          typeLabel: emp.latestIncrease?.type === 'exceptional' ? 'زيادة استثنائية لكفاءة وتميز' : 'زيادة سنوية دورية',
          effectiveDate: emp.latestIncrease?.effectiveDate || new Date().toISOString().slice(0, 10),
          rateBefore: emp.rateBefore,
          rateAfter: emp.rateAfter,
          percentage: emp.pct,
          decisionNumber: emp.latestIncrease?.decisionNumber || `INC-${emp.code || 'EMP'}`,
          includePdf: bulkIncludePdf
        };

        const templateObj = READY_WHATSAPP_TEMPLATES.find((t) => t.id === bulkTemplateId);
        const messageText = populateWhatsAppTemplate(
          templateObj?.text || '',
          emp,
          {},
          orgSettings,
          '',
          emp.resolvedBranchName,
          promoData
        );

        let certHtml = '';
        if (bulkIncludePdf) {
          certHtml = generateSalaryIncreaseCertificateHtml(
            emp,
            {
              decisionNumber: promoData.decisionNumber,
              type: promoData.type,
              decisionDate: emp.latestIncrease?.decisionDate || promoData.effectiveDate,
              effectiveDate: promoData.effectiveDate,
              rateBefore: emp.rateBefore,
              rateAfter: emp.rateAfter,
              jobTitle: emp.jobTitle,
              branchName: emp.resolvedBranchName,
              phone: phone,
              appreciationText: emp.latestIncrease?.notes
            },
            orgSettings,
            emp.resolvedBranchName
          );
        }

        const res = await fetch(`${waServerUrl}/api/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'bypass-tunnel-reminder': 'true' },
          body: JSON.stringify({
            phone: phone,
            message: messageText,
            includePdf: bulkIncludePdf,
            pdfHtml: certHtml || undefined,
            fileName: `شهادة_زيادة_راتب_${(emp.displayName || emp.name || 'موظف').replace(/\s+/g, '_')}.pdf`
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          successCount++;
        } else {
          failedCount++;
          failures.push({ name: getEmpDisplayName(emp), reason: data.message || 'فشل الإرسال' });
        }
      } catch (err) {
        failedCount++;
        failures.push({ name: getEmpDisplayName(emp), reason: err.message });
      }

      // Safe pacing interval (1.5s) to avoid Baileys burst throttling on VPS
      if (i < targetEmployees.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    setBulkProgress({ current: targetEmployees.length, total: targetEmployees.length, success: successCount, failed: failedCount });
    setIsSendingBulk(false);
    setBulkReport({ successCount, failedCount, failures });
  };

  // Bulk Print Selected Certificates
  const handleBulkPrint = () => {
    const targetEmployees = filteredEmployees.filter((e) => selectedEmpIds.includes(e.id));
    if (targetEmployees.length === 0) {
      showToast('⚠️ يرجى تحديد موظف واحد على الأقل للطباعة');
      return;
    }

    const pagesHtml = targetEmployees.map((emp) => {
      return generateSalaryIncreaseCertificateHtml(
        emp,
        {
          decisionNumber: emp.latestIncrease?.decisionNumber || `INC-${emp.code || 'EMP'}`,
          type: emp.latestIncrease?.type || 'annual',
          decisionDate: emp.latestIncrease?.decisionDate || emp.latestIncrease?.effectiveDate || new Date().toISOString().slice(0, 10),
          effectiveDate: emp.latestIncrease?.effectiveDate || new Date().toISOString().slice(0, 10),
          rateBefore: emp.rateBefore,
          rateAfter: emp.rateAfter,
          jobTitle: emp.jobTitle,
          branchName: emp.resolvedBranchName,
          phone: emp.phone,
          appreciationText: emp.latestIncrease?.notes
        },
        orgSettings,
        emp.resolvedBranchName
      );
    }).join('\n<div style="page-break-before: always;"></div>\n');

    triggerDirectPrint(pagesHtml);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 99990,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl'
      }}
    >
      <div
        className="modal-card fade-in"
        style={{
          width: '96%',
          maxWidth: '1280px',
          height: '92vh',
          backgroundColor: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          border: '2px solid #059669',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Top Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #064e3b 0%, #047857 50%, #0f766e 100%)',
            color: '#ffffff',
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 2px 10px rgba(4, 120, 87, 0.25)',
            borderBottom: '2px solid #d97706'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '28px' }}>📜</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, letterSpacing: '0.4px' }}>
                  مركز شهادات الزيادات والعلاوات والإرسال الجماعي
                </h3>
                {/* Server Status Pill */}
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: '12px',
                    background: serverHealth.status === 'connected'
                      ? 'rgba(34, 197, 94, 0.25)'
                      : (serverHealth.status === 'qr_ready' || serverHealth.status === 'checking' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(239, 68, 68, 0.25)'),
                    border: `1px solid ${
                      serverHealth.status === 'connected'
                        ? '#4ade80'
                        : (serverHealth.status === 'qr_ready' || serverHealth.status === 'checking' ? '#facc15' : '#f87171')
                    }`,
                    color: '#ffffff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                  title={serverHealth.message}
                >
                  <span>{serverHealth.status === 'connected' ? '🟢' : (serverHealth.status === 'qr_ready' ? '🟡' : (serverHealth.status === 'checking' ? '⏳' : '🔴'))}</span>
                  <span>
                    {serverHealth.status === 'connected'
                      ? `خادم الواتساب متصل ${serverHealth.phone ? '(+' + serverHealth.phone + ')' : ''}`
                      : (serverHealth.status === 'qr_ready'
                        ? 'بانتظار مسح QR'
                        : (serverHealth.status === 'checking' ? 'جاري فحص الاتصال...' : 'خادم الواتساب غير متصل'))}
                  </span>
                </span>
              </div>
              <div style={{ fontSize: '12px', opacity: 0.92, marginTop: '3px' }}>
                استخراج شهادات الزيادة الرسمية المعتمدة • إرسال فردي وجماعي مدعوم بملفات الـ PDF والباركود الرقمي
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: '#ffffff',
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              fontSize: '18px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s'
            }}
            title="إغلاق النافذة"
          >
            ✕
          </button>
        </div>

        {/* Stats Strip */}
        <div
          style={{
            background: '#f8fafc',
            borderBottom: '1.5px solid #e2e8f0',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>الموظفون الحاصلون على زيادات:</span>
              <strong style={{ fontSize: '15px', color: '#065f46', background: '#dcfce7', padding: '2px 10px', borderRadius: '8px', border: '1px solid #86efac' }}>
                {stats.totalWithIncreases} من {stats.totalEmployees}
              </strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>إجمالي حركات الزيادة المعتمدة:</span>
              <strong style={{ fontSize: '15px', color: '#0f766e', background: '#ccfbf1', padding: '2px 10px', borderRadius: '8px', border: '1px solid #99f6e4' }}>
                {stats.totalIncreasesCount} حركة
              </strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>المحدد حالياً للإرسال/الطباعة:</span>
              <strong style={{ fontSize: '15px', color: '#1e40af', background: '#dbeafe', padding: '2px 10px', borderRadius: '8px', border: '1px solid #93c5fd' }}>
                {selectedEmpIds.length} موظف
              </strong>
            </div>
          </div>

          {/* Bulk Actions Quick Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={handleBulkPrint}
              disabled={selectedEmpIds.length === 0}
              style={{
                background: selectedEmpIds.length > 0 ? 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)' : '#cbd5e1',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '7px 14px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: selectedEmpIds.length > 0 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🖨️</span> طباعة الشهادات المحددة ({selectedEmpIds.length})
            </button>

            <button
              type="button"
              onClick={handleStartBulkSend}
              disabled={selectedEmpIds.length === 0 || isSendingBulk}
              style={{
                background: selectedEmpIds.length > 0 && !isSendingBulk ? 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)' : '#94a3b8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '7px 16px',
                fontSize: '12.5px',
                fontWeight: 900,
                cursor: selectedEmpIds.length > 0 && !isSendingBulk ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: selectedEmpIds.length > 0 ? '0 2px 6px rgba(22, 163, 74, 0.3)' : 'none'
              }}
            >
              <span>{isSendingBulk ? '⏳' : '🚀'}</span>
              <span>{isSendingBulk ? 'جاري الإرسال الجماعي...' : `إرسال جماعي بالواتساب (${selectedEmpIds.length})`}</span>
            </button>
          </div>
        </div>

        {/* Bulk Progress Bar */}
        {isSendingBulk && (
          <div style={{ background: '#ecfdf5', borderBottom: '1px solid #a7f3d0', padding: '10px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 800, color: '#065f46', marginBottom: '4px' }}>
              <span>جاري إرسال الشهادات عبر خادم الواتساب... ({bulkProgress.current} من {bulkProgress.total})</span>
              <span>ناجح: {bulkProgress.success} | تعذر: {bulkProgress.failed}</span>
            </div>
            <div style={{ height: '8px', width: '100%', background: '#d1fae5', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                  width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%`,
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          </div>
        )}

        {/* Bulk Completion Report */}
        {bulkReport && !isSendingBulk && (
          <div style={{ background: bulkReport.failedCount === 0 ? '#f0fdf4' : '#fffbeb', borderBottom: '1.5px solid #cbd5e1', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: bulkReport.failedCount === 0 ? '#166534' : '#92400e' }}>
              🎉 اكتمل الإرسال الجماعي: تم إرسال <strong>{bulkReport.successCount}</strong> بنجاح
              {bulkReport.failedCount > 0 && ` • تعذر إرسال (${bulkReport.failedCount}) موظف`}
            </div>
            <button
              type="button"
              onClick={() => setBulkReport(null)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
            >
              إخفاء الإشعار ✕
            </button>
          </div>
        )}

        {/* Filter Controls */}
        <div style={{ padding: '14px 24px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Filter Mode Tabs */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setFilterMode('with_increases')}
              style={{
                background: filterMode === 'with_increases' ? '#ffffff' : 'transparent',
                color: filterMode === 'with_increases' ? '#065f46' : '#475569',
                border: 'none',
                borderRadius: '7px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: filterMode === 'with_increases' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              📈 الحاصلون على زيادات فقط ({stats.totalWithIncreases})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              style={{
                background: filterMode === 'all' ? '#ffffff' : 'transparent',
                color: filterMode === 'all' ? '#065f46' : '#475569',
                border: 'none',
                borderRadius: '7px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: filterMode === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              👥 كافة الموظفين ({stats.totalEmployees})
            </button>
          </div>

          {/* Branch Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>الفرع:</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              style={{ height: '34px', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 8px', fontSize: '12px', fontWeight: 700 }}
            >
              <option value="all">كافة الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 بحث بالاسم، الكود، الوظيفة أو الفرع..."
              style={{ width: '100%', height: '34px', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 12px', fontSize: '12px' }}
            />
          </div>

          {/* Select All Toggle */}
          <button
            type="button"
            onClick={handleSelectAll}
            style={{
              background: '#f8fafc',
              border: '1.5px solid #cbd5e1',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 800,
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            {selectedEmpIds.length === filteredEmployees.length ? 'إلغاء تحديد الكل' : 'تحديد كل الظاهرين'}
          </button>
        </div>

        {/* Table Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', background: '#f8fafc' }}>
          {filteredEmployees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', background: '#ffffff', borderRadius: '14px', border: '1.5px dashed #cbd5e1', color: '#64748b' }}>
              <div style={{ fontSize: '42px', marginBottom: '10px' }}>🔍</div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 800, color: '#334155' }}>لم يتم العثور على أي موظف مطابق للفلتر</h4>
              <p style={{ margin: 0, fontSize: '13px' }}>جرب تغيير خيارات الفلترة أو تفريغ خانة البحث.</p>
            </div>
          ) : (
            <div style={{ background: '#ffffff', borderRadius: '12px', border: '1.5px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'center' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#334155', borderBottom: '2px solid #cbd5e1', fontWeight: 900 }}>
                    <th style={{ padding: '10px 8px', width: '38px' }}>
                      <input
                        type="checkbox"
                        checked={filteredEmployees.length > 0 && selectedEmpIds.length === filteredEmployees.length}
                        onChange={handleSelectAll}
                        style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                      />
                    </th>
                    <th style={{ padding: '10px 6px', width: '35px' }}>#</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right' }}>بيانات الموظف</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>الفرع والهاتف</th>
                    <th style={{ padding: '10px 10px' }}>طبيعة الزيادة</th>
                    <th style={{ padding: '10px 10px' }}>تاريخ السريان</th>
                    <th style={{ padding: '10px 10px' }}>السعر قبل</th>
                    <th style={{ padding: '10px 10px' }}>السعر بعد</th>
                    <th style={{ padding: '10px 10px' }}>الصافي والنسبة</th>
                    <th style={{ padding: '10px 12px', width: '210px' }}>الإجراءات المباشرة</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((emp, idx) => {
                    const isSelected = selectedEmpIds.includes(emp.id);
                    const hasIncreases = emp.salaryIncreases && emp.salaryIncreases.length > 0;
                    const isSendingThis = quickSendingId === emp.id;

                    const typeBadge = emp.latestIncrease?.type === 'exceptional' ? (
                      <span style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #d8b4fe', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                        ⭐ استثنائية
                      </span>
                    ) : (emp.latestIncrease?.type === 'adjustment' ? (
                      <span style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                        ⚖️ تعديل هيكلي
                      </span>
                    ) : hasIncreases ? (
                      <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                        🌱 سنوية
                      </span>
                    ) : (
                      <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                        لا توجد
                      </span>
                    ));

                    return (
                      <tr
                        key={emp.id}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          background: isSelected ? '#f0fdf4' : (idx % 2 === 0 ? '#ffffff' : '#fbfcfd'),
                          transition: 'background 0.15s'
                        }}
                      >
                        <td style={{ padding: '10px 8px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(emp.id)}
                            style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                          />
                        </td>
                        <td style={{ padding: '10px 6px', color: '#64748b', fontWeight: 700 }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '13px' }}>
                            {getEmpDisplayName(emp)}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                            كود: <strong>{emp.code || '—'}</strong> • {emp.jobTitle || 'عضو الكادر'}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: '#334155' }}>{emp.resolvedBranchName}</div>
                          <div style={{ fontSize: '11px', color: '#047857', marginTop: '2px', fontFamily: 'monospace', fontWeight: 700 }}>
                            {getEmpWhatsAppPhone(emp) || emp.phone || 'غير مسجل'}
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px' }}>{typeBadge}</td>
                        <td style={{ padding: '10px 10px', fontWeight: 700, color: '#0f766e' }}>
                          {emp.latestIncrease?.effectiveDate || '—'}
                        </td>
                        <td style={{ padding: '10px 10px', color: '#64748b', fontWeight: 700 }}>
                          {fmt(emp.rateBefore)} ج.م
                        </td>
                        <td style={{ padding: '10px 10px', color: '#059669', fontWeight: 900, fontSize: '13px' }}>
                          {fmt(emp.rateAfter)} ج.م
                        </td>
                        <td style={{ padding: '10px 10px', fontWeight: 800, color: emp.diff > 0 ? '#16a34a' : '#64748b' }}>
                          {emp.diff > 0 ? `+${fmt(emp.diff)} (+${emp.pct}%)` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {/* Certificate Edit / View Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenCert(emp)}
                              style={{
                                background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                                color: '#065f46',
                                border: '1.5px solid #10b981',
                                borderRadius: '7px',
                                padding: '5px 10px',
                                fontSize: '11.5px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="عرض الشهادة المعتمدة وتعديلها وطباعتها"
                            >
                              <span>📜</span>
                              <span>الشهادة</span>
                            </button>

                            {/* Quick WhatsApp Send */}
                            <button
                              type="button"
                              onClick={() => handleQuickSend(emp)}
                              disabled={isSendingThis}
                              style={{
                                background: isSendingThis ? '#94a3b8' : 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '7px',
                                padding: '5px 10px',
                                fontSize: '11.5px',
                                fontWeight: 800,
                                cursor: isSendingThis ? 'not-allowed' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 1px 3px rgba(22, 163, 74, 0.2)'
                              }}
                              title="إرسال فوري للشهادة عبر الواتساب مع ملف الـ PDF"
                            >
                              <span>{isSendingThis ? '⏳' : '📲'}</span>
                              <span>{isSendingThis ? 'إرسال...' : 'إرسال واتساب'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 24px',
            background: '#ffffff',
            borderTop: '1.5px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            إجمالي السجلات المعروضة: <strong>{filteredEmployees.length} موظف</strong> • المحدد للإجراء: <strong>{selectedEmpIds.length}</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              color: '#334155',
              border: '1.5px solid #cbd5e1',
              borderRadius: '8px',
              padding: '8px 24px',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            إغلاق النافذة
          </button>
        </div>
      </div>

      {/* Embedded Single Certificate Modal for Editing / Preview */}
      {certModalEmp && (
        <SalaryIncreaseCertificateModal
          isOpen={Boolean(certModalEmp)}
          onClose={() => {
            setCertModalEmp(null);
            setCertModalRecord(null);
          }}
          employee={{
            ...certModalEmp,
            phone: getEmpWhatsAppPhone(certModalEmp) || certModalEmp.phone,
            branchName: certModalEmp.resolvedBranchName,
            rateBefore: certModalEmp.rateBefore,
            rateAfter: certModalEmp.rateAfter,
            salary: certModalEmp.currentRate,
            lastIncrease: certModalRecord || certModalEmp.latestIncrease
          }}
          allEmployees={employees}
          increaseRecord={certModalRecord}
          orgSettings={orgSettings}
          state={state}
          showToast={showToast}
        />
      )}
    </div>
  );
}
